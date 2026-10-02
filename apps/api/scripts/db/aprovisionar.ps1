# Aprovisionamiento local de SoftArq (ADR-0004).
#
# Desde la raíz del repositorio:
#   Interactivo (psql pide la contraseña de postgres):
#     powershell -ExecutionPolicy Bypass -File apps\api\scripts\db\aprovisionar.ps1
#   Sin interacción, con la credencial cifrada con DPAPI (misma cuenta de Windows):
#     powershell -ExecutionPolicy Bypass -File apps\api\scripts\db\aprovisionar.ps1 -ArchivoCredencial <ruta.dpapi>
#   Solo diagnóstico (consulta de lectura de roles y bases del proyecto; no cambia nada):
#     ... -ArchivoCredencial <ruta.dpapi> -SoloDiagnostico
#
# Seguridad:
# - La contraseña administrativa se descifra SOLO dentro de este proceso y se entrega a psql
#   por la variable de entorno PGPASSWORD; nunca va en argumentos, archivos ni registros.
# - Las contraseñas de los roles del proyecto se leen de apps\api\.env y llegan a psql por
#   variables de entorno (\getenv en aprovisionar.sql).
# - Todas las variables temporales se eliminan en el bloque finally.
param(
    [string]$ArchivoCredencial,
    [switch]$SoloDiagnostico
)

$ErrorActionPreference = 'Stop'
$api = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$archivoEnv = Join-Path $api '.env'
$sql = Join-Path $PSScriptRoot 'aprovisionar.sql'
$psql = 'D:\Postgres18\bin\psql.exe'

if (-not (Test-Path $psql)) { throw "No se encontró $psql." }

$diagnostico = @"
SELECT 'rol' AS tipo, rolname AS nombre, rolsuper AS superusuario, rolcreatedb AS crea_bases, rolcreaterole AS crea_roles, rolcanlogin AS login
  FROM pg_roles WHERE rolname IN ('softarq_migrator', 'softarq_app')
UNION ALL
SELECT 'base', datname || ' (propietario ' || pg_get_userbyid(datdba) || ')', NULL, NULL, NULL, NULL
  FROM pg_database WHERE datname IN ('softarq_dev', 'softarq_test', 'softarq_shadow')
ORDER BY 1, 2;
"@

$texto = $null
$bstr = [IntPtr]::Zero
try {
    if ($ArchivoCredencial) {
        if (-not (Test-Path $ArchivoCredencial)) { throw "No existe el archivo de credencial indicado." }
        # ConvertFrom-SecureString produce hexadecimal; se quitan saltos de línea finales.
        $seguro = (Get-Content -Raw $ArchivoCredencial).Trim() | ConvertTo-SecureString
        $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($seguro)
        $env:PGPASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
        $modo = '-w'   # nunca pedir contraseña: falla si la credencial no sirve
    }
    else {
        $modo = '-W'   # psql pide la contraseña de postgres
    }

    if ($SoloDiagnostico) {
        Write-Host 'Diagnóstico (solo lectura) de roles y bases del proyecto:'
        & $psql -h localhost -p 5432 -U postgres -d postgres $modo -X -v ON_ERROR_STOP=1 -c $diagnostico
        if ($LASTEXITCODE -ne 0) { throw "psql terminó con código $LASTEXITCODE." }
        return
    }

    if (-not (Test-Path $archivoEnv)) {
        throw "No existe $archivoEnv. Ejecuta antes: node apps\api\scripts\db\generar-credenciales.mjs"
    }
    $texto = Get-Content -Raw -Encoding UTF8 $archivoEnv
    $env:SOFTARQ_MIGRATOR_PASSWORD = [regex]::Match($texto, 'postgresql://softarq_migrator:([A-Za-z0-9_-]+)@').Groups[1].Value
    $env:SOFTARQ_APP_PASSWORD = [regex]::Match($texto, 'postgresql://softarq_app:([A-Za-z0-9_-]+)@').Groups[1].Value
    if (-not $env:SOFTARQ_MIGRATOR_PASSWORD -or -not $env:SOFTARQ_APP_PASSWORD) {
        throw "No se encontraron las contraseñas de los roles en $archivoEnv."
    }

    Write-Host 'Aprovisionando roles y bases del proyecto en PostgreSQL local...'
    & $psql -h localhost -p 5432 -U postgres -d postgres $modo -X -v ON_ERROR_STOP=1 -f $sql
    if ($LASTEXITCODE -ne 0) { throw "psql terminó con código $LASTEXITCODE." }
}
finally {
    Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
    Remove-Item Env:SOFTARQ_MIGRATOR_PASSWORD -ErrorAction SilentlyContinue
    Remove-Item Env:SOFTARQ_APP_PASSWORD -ErrorAction SilentlyContinue
    if ($bstr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
    $texto = $null
    $seguro = $null
}
