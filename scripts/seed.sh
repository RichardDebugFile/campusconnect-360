#!/usr/bin/env bash
# ============================================================================
# CampusConnect 360 — Datos semilla (seed) reproducible
# ----------------------------------------------------------------------------
# Puebla el ecosistema con datos de ejemplo ENTRANDO POR EL API GATEWAY, es
# decir, ejercitando las mismas APIs y eventos que usan los portales. Esto es
# coherente con la arquitectura event-driven: cada alta publica su evento, de
# modo que Notificaciones y Analítica también quedan poblados (no se insertan
# filas "por detrás" en cada base).
#
# Requisitos: el stack debe estar arriba (docker compose up --build) y `curl`
# disponible. Uso:
#     bash scripts/seed.sh                  # usa http://localhost:8080
#     GATEWAY=http://host:8080 bash scripts/seed.sh
# ============================================================================
set -euo pipefail

GATEWAY="${GATEWAY:-http://localhost:8080}"
PASS="${PASS:-campus123}"

say() { printf '\n\033[1;36m» %s\033[0m\n' "$*"; }
ok()  { printf '  \033[1;32m✓\033[0m %s\n' "$*"; }

# Inicia sesión y devuelve el token JWT de un rol.
login() {
  local user="$1"
  curl -s -X POST "$GATEWAY/auth/login" \
    -H 'Content-Type: application/json' \
    -d "{\"username\":\"$user\",\"password\":\"$PASS\"}" \
    | sed -n 's/.*"token":"\([^"]*\)".*/\1/p'
}

# Extrae un campo simple ("id") de una respuesta JSON.
json_field() { sed -n "s/.*\"$1\":\"\{0,1\}\([^\",}]*\)\"\{0,1\}.*/\1/p" | head -1; }

say "Autenticando roles"
TOK_SEC="$(login secretaria)"; ok "secretaria"
TOK_FIN="$(login finanzas)";   ok "finanzas"
TOK_DOC="$(login docente)";    ok "docente"

# --------------------------------------------------------------------------
say "1) Secretaría matricula estudiantes  (evento StudentEnrolled)"
declare -a STUDENTS=(
  '{"firstName":"María","lastName":"Pérez","grade":"8vo EGB","schoolId":"SCH-001"}'
  '{"firstName":"Juan","lastName":"Gómez","grade":"9no EGB","schoolId":"SCH-001"}'
  '{"firstName":"Ana","lastName":"Torres","grade":"1ro BGU","schoolId":"SCH-002"}'
)
IDS=()
for body in "${STUDENTS[@]}"; do
  resp="$(curl -s -X POST "$GATEWAY/api/academic/students" \
    -H "Authorization: Bearer $TOK_SEC" -H 'Content-Type: application/json' -d "$body")"
  sid="$(echo "$resp" | sed -n 's/.*"id":"\(STU-[0-9]*\)".*/\1/p' | head -1)"
  IDS+=("$sid"); ok "estudiante $sid"
done

FIRST="${IDS[0]}"

# --------------------------------------------------------------------------
say "2) Finanzas crea obligaciones y confirma un pago  (evento PaymentConfirmed)"
for sid in "${IDS[@]}"; do
  pay="$(curl -s -X POST "$GATEWAY/api/payments/payments" \
    -H "Authorization: Bearer $TOK_FIN" -H 'Content-Type: application/json' \
    -d "{\"studentId\":\"$sid\",\"concept\":\"Matrícula 2026\",\"amount\":150}")"
  pid="$(echo "$pay" | json_field id)"
  ok "obligación #$pid ($sid)"
done
# Confirma la del primer estudiante -> Académico lo marca 'solvent'
PID_FIRST="$(curl -s -X GET "$GATEWAY/api/payments/payments?studentId=$FIRST&status=pending" \
  -H "Authorization: Bearer $TOK_FIN" | sed -n 's/.*"id":\([0-9]*\).*/\1/p' | head -1)"
curl -s -X POST "$GATEWAY/api/payments/payments/$PID_FIRST/confirm" \
  -H "Authorization: Bearer $TOK_FIN" >/dev/null
ok "pago #$PID_FIRST confirmado ($FIRST → solvente)"

# --------------------------------------------------------------------------
say "3) Docente registra asistencia e incidente  (AttendanceRecorded / IncidentReported)"
curl -s -X POST "$GATEWAY/api/attendance/attendance" \
  -H "Authorization: Bearer $TOK_DOC" -H 'Content-Type: application/json' \
  -d "{\"studentId\":\"$FIRST\",\"status\":\"present\",\"note\":\"Puntual\"}" >/dev/null
ok "asistencia de $FIRST"
curl -s -X POST "$GATEWAY/api/attendance/incidents" \
  -H "Authorization: Bearer $TOK_DOC" -H 'Content-Type: application/json' \
  -d "{\"studentId\":\"${IDS[1]}\",\"type\":\"conducta\",\"severity\":\"medium\",\"description\":\"Llamado de atención\"}" >/dev/null
ok "incidente de ${IDS[1]}"

say "Semilla completada. Abre el Dashboard (http://localhost:8090) para ver los indicadores."
