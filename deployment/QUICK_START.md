# 🚀 Quick Start - Deployment Rápido

## Para el Cliente (Resumen Ejecutivo)

### ¿Qué necesitas?

1. **Un servidor** con Ubuntu 20.04+ (recomendado: DigitalOcean, Contabo, Linode)
   - Mínimo: 2GB RAM, 20GB disco
   - Costo: ~$5-10/mes

2. **Un dominio** (opcional pero recomendado)
   - Ejemplo: analisis-ia.tuempresa.com
   - Apuntar DNS tipo A al IP del servidor

3. **Claves de API** de OpenAI
   - Obtener en: https://platform.openai.com/api-keys
   - O los usuarios usarán sus propias claves

### Deployment en 30 Minutos

#### 1. Preparar el Servidor (10 min)

```bash
# Conectar al servidor
ssh root@IP-DEL-SERVIDOR

# Ejecutar script de instalación
curl -fsSL https://raw.githubusercontent.com/tu-repo/main/deployment/install-server.sh | bash
```

#### 2. Subir la Aplicación (10 min)

**Opción A: Con Git**
```bash
cd /var/www
git clone https://tu-repositorio.git mediciones-ia
cd mediciones-ia
npm install --production
npm run build
```

**Opción B: Con SFTP (Más fácil)**
1. Descargar FileZilla o WinSCP
2. Conectar a tu servidor
3. Subir la carpeta completa a `/var/www/mediciones-ia/`
4. Por SSH ejecutar:
```bash
cd /var/www/mediciones-ia
npm install --production
npm run build
```

#### 3. Configurar y Arrancar (10 min)

```bash
cd /var/www/mediciones-ia

# Configurar variables de entorno
cp deployment/.env.production.example .env
nano .env  # Editar y poner tu API key de OpenAI

# Iniciar con PM2
pm2 start deployment/pm2.config.js
pm2 save
pm2 startup  # Seguir instrucciones que aparecen

# Configurar Nginx
cp deployment/nginx.conf /etc/nginx/sites-available/mediciones-ia
nano /etc/nginx/sites-available/mediciones-ia  # Cambiar "tu-dominio.com"
ln -s /etc/nginx/sites-available/mediciones-ia /etc/nginx/sites-enabled/
nginx -t
systemctl reload nginx

# Configurar SSL (si tienes dominio)
certbot --nginx -d tu-dominio.com
```

#### 4. ¡Listo! 🎉

Abre tu navegador en:
- Con dominio: `https://tu-dominio.com`
- Sin dominio: `http://IP-DEL-SERVIDOR`

---

## Comandos Útiles

### Ver estado de la aplicación
```bash
pm2 status
pm2 logs
pm2 monit
```

### Actualizar la aplicación
```bash
cd /var/www/mediciones-ia
./deployment/deploy.sh
```

### Hacer backup
```bash
./deployment/backup.sh
```

### Reiniciar todo
```bash
pm2 restart all
systemctl reload nginx
```

---

## Troubleshooting Rápido

### "La aplicación no carga"
```bash
# Ver logs
pm2 logs

# Verificar que está corriendo
pm2 list

# Reiniciar
pm2 restart all
```

### "Error 502 Bad Gateway"
```bash
# Verificar que el backend está corriendo
curl http://localhost:3003/api/health

# Ver logs de nginx
tail -f /var/log/nginx/error.log
```

### "Cannot connect to API"
```bash
# Verificar puerto
netstat -tulpn | grep 3003

# Verificar variables de entorno
cat .env

# Reiniciar
pm2 restart all
```

---

## Checklist de Entrega

### Antes de entregar al cliente:

- [ ] Servidor configurado y funcionando
- [ ] Dominio apuntando al servidor (si aplica)
- [ ] SSL/HTTPS configurado
- [ ] Aplicación corriendo con PM2
- [ ] Nginx configurado correctamente
- [ ] Base de datos creada y con permisos
- [ ] Backups automáticos configurados
- [ ] Variables de entorno configuradas
- [ ] Probado: crear análisis de prueba
- [ ] Probado: subir Excel
- [ ] Probado: descargar reportes
- [ ] Documentación entregada
- [ ] Credenciales del servidor compartidas de forma segura

### Entregar al cliente:

1. **URL de la aplicación**
2. **Credenciales SSH del servidor** (en formato seguro)
3. **Esta documentación** (deployment/)
4. **Contraseñas y claves** (en gestor de contraseñas o documento encriptado)
5. **Manual de uso básico**

---

## Mantenimiento Regular

### Semanal
- Revisar logs: `pm2 logs`
- Verificar espacio en disco: `df -h`

### Mensual
- Actualizar sistema: `apt update && apt upgrade`
- Revisar backups: `ls -lh /var/backups/mediciones-ia`
- Renovar SSL si es necesario: `certbot renew`

### Cuando haya actualizaciones
```bash
cd /var/www/mediciones-ia
git pull origin main  # Si usas Git
npm install --production
npm run build
pm2 restart all
```

---

## Soporte Post-Entrega

### Incluir en propuesta:
- 1 mes de soporte técnico incluido
- Actualizaciones de seguridad críticas
- Resolución de bugs
- Ayuda con deployment

### No incluido:
- Cambios en funcionalidades
- Nuevas features
- Hosting (responsabilidad del cliente)
- Claves de API (deben obtenerlas ellos)

---

## Costos Estimados Mensuales

| Concepto | Costo Aprox. |
|----------|-------------|
| Servidor VPS (2GB RAM) | $5-10 |
| Dominio (si no tienen) | $10-15/año |
| SSL | Gratis (Let's Encrypt) |
| OpenAI API | Variable según uso* |
| **Total mensual** | **$5-10 + API** |

*Si el cliente usa su propia API key de OpenAI, el costo depende del uso.
Para 1000 preguntas/mes con GPT-4o: ~$15-20

---

## Contacto

Para soporte técnico o dudas:
- Desarrollador: [Tu nombre/empresa]
- Email: [tu-email]
- Horario: [tu horario]
- Urgencias: [tu teléfono]

---

**Última actualización**: Enero 2025
**Versión**: 1.0
