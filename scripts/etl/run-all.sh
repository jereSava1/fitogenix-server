#!/usr/bin/env bash
# Corre el pipeline ETL completo en una sola pasada: descarga el dump de OFF
# si hace falta, ingesta OFF + los 4 retailers VTEX, mergea, y valida
# duplicados. Pensado para no tener que ir tirando comando por comando y
# esperando entre cada uno — un solo `npm run etl:all` (o `./run-all.sh`)
# y te avisa al final.
#
# Uso:
#   ./scripts/etl/run-all.sh [--countries argentina,chile,...] [--enrich] \
#       [--off-file /tmp/off-products.jsonl.gz] [--off-limit 500] [--merge-limit 2000]
#
# Por default NO usa --enrich (no gasta tokens de Claude) — pasalo explícito
# solo si ya confirmaste el volumen/costo (ver README, sección "Nunca").
#
# Para que el Mac no se duerma a mitad de la corrida (puede tardar bastante
# si hay que descargar el dump de OFF, ~30 min):
#   caffeinate -i ./scripts/etl/run-all.sh [...]
set -euo pipefail
cd "$(dirname "$0")/../.."   # raíz de fitogenix-server, sea cual sea el cwd

ENRICH=""
COUNTRIES_FLAG=""
OFF_FILE="/tmp/off-products.jsonl.gz"
OFF_LIMIT=500
MERGE_LIMIT=2000

while [[ $# -gt 0 ]]; do
  case "$1" in
    --enrich) ENRICH="--enrich"; shift ;;
    --countries) COUNTRIES_FLAG="--countries $2"; shift 2 ;;
    --off-file) OFF_FILE="$2"; shift 2 ;;
    --off-limit) OFF_LIMIT="$2"; shift 2 ;;
    --merge-limit) MERGE_LIMIT="$2"; shift 2 ;;
    *) echo "Argumento desconocido: $1" >&2; exit 1 ;;
  esac
done

echo "############################################"
echo "# ETL Fitogenix — corrida completa"
echo "# enrich=${ENRICH:-no} countries=${COUNTRIES_FLAG:-argentina (default)}"
echo "############################################"

if [[ ! -f "$OFF_FILE" ]]; then
  echo ""
  echo "=== [0/6] Descargando dump de Open Food Facts (puede tardar ~30 min) ==="
  curl -L -o "$OFF_FILE" https://static.openfoodfacts.org/data/openfoodfacts-products.jsonl.gz
else
  echo ""
  echo "=== [0/6] Dump de OFF ya existe en $OFF_FILE — no se vuelve a descargar ==="
fi

echo ""
echo "=== [1/6] Ingesta OFF ==="
npm run etl:off -- --file "$OFF_FILE" --limit "$OFF_LIMIT" $COUNTRIES_FLAG

echo ""
echo "=== [2/6] Ingesta VTEX — Carrefour ==="
npm run etl:vtex -- --domain www.carrefour.com.ar --source carrefour --pages 3 --pageSize 50

echo ""
echo "=== [3/6] Ingesta VTEX — Jumbo ==="
npm run etl:vtex -- --domain www.jumbo.com.ar --source jumbo --pages 3 --pageSize 50

echo ""
echo "=== [4/6] Ingesta VTEX — Disco ==="
npm run etl:vtex -- --domain www.disco.com.ar --source disco --pages 3 --pageSize 50

echo ""
echo "=== [5/6] Ingesta VTEX — Vea ==="
npm run etl:vtex -- --domain www.vea.com.ar --source vea --pages 3 --pageSize 50

echo ""
echo "=== [6/6] Merge (enrich=${ENRICH:-no}) ==="
npm run etl:merge -- --limit "$MERGE_LIMIT" $ENRICH

echo ""
echo "=== Stats ==="
npm run etl:stats

echo ""
echo "=== Chequeo de duplicados ==="
npm run etl:check-dupes

echo ""
echo "############################################"
echo "# Listo — pipeline completo."
echo "############################################"
