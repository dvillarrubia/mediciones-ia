#!/bin/bash
set -e

echo "¿Qué tipo de release?"
echo "  1) patch"
echo "  2) minor"
echo "  3) major"
read -p "Selecciona (1/2/3): " choice

case $choice in
  1) type=patch ;;
  2) type=minor ;;
  3) type=major ;;
  *) echo "Opción no válida" && exit 1 ;;
esac

npm version "$type" --tag-version-prefix='mediciones-ia-v' -m "release: mediciones-ia-v%s"

tag=$(git describe --tags --abbrev=0)

echo ""
echo "✅ Tag creado: $tag"
echo ""
echo "👉 Ejecuta para desplegar en PRE:"
echo "   git push && git push --tags"
