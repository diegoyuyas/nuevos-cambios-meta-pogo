@echo off
REM Ejecuta el extractor de imagenes de Pokemon (normal + shadow)
REM Debe correrse desde la carpeta raiz del proyecto (donde esta este .bat)

echo Instalando/verificando dependencia Pillow...
python -m pip install pillow --quiet

echo.
echo Ejecutando extractor de imagenes...
python extraer_imagenes_pokemon.py

echo.
pause
