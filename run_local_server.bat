@echo off
set PORT=5501
echo Starting Python HTTP server on port %PORT%...
python -m http.server %PORT%
pause
