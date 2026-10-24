# Aprovisionamiento para respaldo y prueba de restauración (ADR-0012). Una sola vez; idempotente.
#
# Desde la raíz del repositorio:
#   Interactivo (psql pide la contraseña de postgres; nunca pasa por el chat ni por argumentos):
#     powershell -ExecutionPolicy Bypass -File apps\api\scripts\db\aprovisionar-respaldo.ps1
#   Sin interacción, con la credencial administrativa cifrada con DPAPI (misma cuenta de Windows):
#     ... -ArchivoCredencial <ruta.dpapi> [-EliminarCredencial]
#   El archivo .dpapi se crea en una ventana LOCAL de PowerShell (la contraseña no se muestra ni se guarda en claro):
#     Read-Host 'Contraseña de postgres' -AsSecureString | ConvertFrom-SecureString | Set-Content -Encoding ascii D:\Proyecto_SoftArq\_work\secrets\postgres-admin.dpapi
#   -EliminarCredencial lo borra al terminar (también si falla).
#
# Hace:
# - si no existe, crea apps\api\.env.respaldo (excluido de Git por .env.*) con una contraseña aleatoria
#   para el rol softarq_respaldo; no la imprime;
# - ejecuta aprovisionar-respaldo.sql como postgres: rol softarq_respaldo (solo lectura de softarq_dev)
#   y base aislada softarq_restauracion.
#
# Seguridad: igual que aprovisionar.ps1. La contraseña administrativa solo vive en este proceso
# (PGPASSWORD); la del rol llega a psql por variable de entorno (\getenv). Todo se limpia en finally.
param(
    [string]$ArchivoCredencial,
    [switch]$EliminarCredencial
)

$ErrorActionPreference = 'Stop'
$api = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$archivoRespaldo = Join-Path $api '.env.respaldo'
$sql = Join-Path $PSScriptRoot 'aprovisionar-respaldo.sql'
# psql: SOFTARQ_PG_BIN, la instalación estándar de PostgreSQL 18 o la del equipo original.
$psql = @(
    $(if ($env:SOFTARQ_PG_BIN) { Join-Path $env:SOFTARQ_PG_BIN 'psql.exe' }),
    (Join-Path $env:ProgramFiles 'PostgreSQL\18\bin\psql.exe'),
    'D:\Postgres18\bin\psql.exe'
) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1

if (-not $psql) { throw "No se encontró psql.exe (defina SOFTARQ_PG_BIN)." }

# 1. Credencial local del rol de respaldo (solo si falta; nunca se sobrescribe).
if (-not (Test-Path $archivoRespaldo)) {
    $bytes = New-Object byte[] 32
    [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    $clave = [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
    $contenido = @(
        '# Respaldo de softarq_dev: generado por scripts/db/aprovisionar-respaldo.ps1. NO VERSIONAR.',
        '# Rol softarq_respaldo: solo lectura (CONNECT a softarq_dev y SELECT). Ver docs/operacion/respaldo-y-restauracion.md.',
        "RESPALDO_DATABASE_URL=postgresql://softarq_respaldo:$clave@localhost:5432/softarq_dev",
        ''
    ) -join "`n"
    [IO.File]::WriteAllText($archivoRespaldo, $contenido, (New-Object Text.UTF8Encoding($false)))
    $clave = $null
    Write-Host "Creado $archivoRespaldo (contraseña aleatoria; no se muestra)."
}
else {
    Write-Host "Se conserva $archivoRespaldo (ya existía)."
}

$texto = $null
$bstr = [IntPtr]::Zero
try {
    $texto = Get-Content -Raw -Encoding UTF8 $archivoRespaldo
    $env:SOFTARQ_RESPALDO_PASSWORD = [regex]::Match($texto, 'postgresql://softarq_respaldo:([A-Za-z0-9_-]+)@').Groups[1].Value
    if (-not $env:SOFTARQ_RESPALDO_PASSWORD) { throw "No se encontró la contraseña de softarq_respaldo en $archivoRespaldo." }

    if ($ArchivoCredencial) {
        if (-not (Test-Path $ArchivoCredencial)) { throw "No existe el archivo de credencial indicado." }
        $seguro = (Get-Content -Raw $ArchivoCredencial).Trim() | ConvertTo-SecureString
        $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($seguro)
        $env:PGPASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
        $modo = '-w'
    }
    else {
        $modo = '-W'
    }

    Write-Host 'Aprovisionando el rol softarq_respaldo y la base aislada softarq_restauracion...'
    & $psql -h localhost -p 5432 -U postgres -d postgres $modo -X -v ON_ERROR_STOP=1 -f $sql
    if ($LASTEXITCODE -ne 0) { throw "psql terminó con código $LASTEXITCODE." }
}
finally {
    Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
    Remove-Item Env:SOFTARQ_RESPALDO_PASSWORD -ErrorAction SilentlyContinue
    if ($bstr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
    $texto = $null
    $seguro = $null
    if ($EliminarCredencial -and $ArchivoCredencial -and (Test-Path $ArchivoCredencial)) {
        Remove-Item -LiteralPath $ArchivoCredencial -Force
        Write-Host 'Archivo de credencial administrativa eliminado.'
    }
}
