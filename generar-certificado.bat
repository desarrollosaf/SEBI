@echo off
rem Genera un certificado autofirmado nuevo (requiere openssl en el PATH, p. ej. el que instala Git para Windows).
cd /d "%~dp0"
openssl req -x509 -nodes -newkey rsa:2048 -keyout cert\servidor.key -out cert\servidor.crt -days 3650 -subj "/C=MX/ST=Estado de Mexico/L=Toluca/O=Poder Legislativo del Estado de Mexico/OU=Direccion de Informatica/CN=sebi.local" -addext "subjectAltName=DNS:sebi.local,DNS:localhost,IP:127.0.0.1"
pause
