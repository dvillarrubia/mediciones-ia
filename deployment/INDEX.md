# 📚 Índice de Documentación de Deployment

## 🎯 ¿Por dónde empezar?

### Si eres el CLIENTE:
1. Lee primero: **QUICK_START.md** (30 minutos)
2. Elige hosting: **HOSTING_OPTIONS.md**
3. Sigue pasos: **README.md** (Guía completa)

### Si eres el DESARROLLADOR:
1. Revisa: **CHECKLIST_ENTREGA.md**
2. Prepara servidor: **install-server.sh**
3. Deploya: **deploy.sh**
4. Entrega: **CHECKLIST_ENTREGA.md**

---

## 📁 Archivos en esta carpeta

### 📘 Guías y Documentación

#### **README.md** (⭐ Principal)
Documentación completa de deployment con:
- Requisitos del servidor
- Preparación del proyecto
- Deployment en VPS paso a paso
- Deployment en servicios cloud
- Configuración post-deployment
- Mantenimiento y troubleshooting

**¿Cuándo usar?** Guía de referencia completa. Léela si vas a hacer deployment manual en un VPS.

---

#### **QUICK_START.md** (⭐ Inicio Rápido)
Guía ejecutiva resumida:
- Deployment en 30 minutos
- Comandos básicos
- Troubleshooting rápido
- Checklist mínimo

**¿Cuándo usar?** Si ya tienes experiencia con servidores y quieres ir al grano.

---

#### **HOSTING_OPTIONS.md** (💰 Comparativa)
Comparativa detallada de proveedores:
- DigitalOcean (recomendado)
- Contabo (más barato)
- Railway (más rápido)
- Render (gratis para empezar)
- AWS (empresarial)

Incluye:
- Precios exactos
- Pros y contras
- Pasos específicos por proveedor
- Recomendaciones según caso de uso

**¿Cuándo usar?** Antes de contratar hosting. Te ayuda a decidir qué opción es mejor.

---

#### **CHECKLIST_ENTREGA.md** (✅ Para Entregar)
Checklist completo de entrega al cliente:
- Pre-entrega (qué verificar)
- Paquete de entrega (qué enviar)
- Template de email
- Post-entrega (seguimiento)
- Informe final

**¿Cuándo usar?** Cuando vayas a entregar el proyecto al cliente. No olvides nada.

---

### 🔧 Scripts y Configuraciones

#### **install-server.sh** (🖥️ Setup Servidor)
Script de instalación automática del servidor.

Instala:
- Node.js 20
- PM2
- Nginx
- Certbot (SSL)
- Firewall

**Uso**:
```bash
chmod +x install-server.sh
./install-server.sh
```

O remotamente:
```bash
curl -fsSL [URL] | bash
```

---

#### **deploy.sh** (🚀 Deployment)
Script de deployment/actualización automatizado.

Hace:
- Backup pre-deployment
- Git pull (si aplica)
- npm install
- npm build
- Reiniciar PM2
- Verificar salud

**Uso**:
```bash
cd /var/www/mediciones-ia
./deployment/deploy.sh
```

---

#### **backup.sh** (💾 Backups)
Script de backup automático.

Respalda:
- Base de datos SQLite
- Configuraciones
- Variables de entorno

**Uso manual**:
```bash
./deployment/backup.sh
```

**Uso automático (cron)**:
```bash
crontab -e
# Agregar: 0 2 * * * /var/www/mediciones-ia/deployment/backup.sh
```

---

#### **nginx.conf** (🌐 Servidor Web)
Configuración de Nginx.

Incluye:
- Proxy a la API
- Servir frontend estático
- SSL/HTTPS
- Timeouts para análisis largos

**Uso**:
```bash
cp deployment/nginx.conf /etc/nginx/sites-available/mediciones-ia
# Editar y cambiar "tu-dominio.com"
ln -s /etc/nginx/sites-available/mediciones-ia /etc/nginx/sites-enabled/
nginx -t
systemctl reload nginx
```

---

#### **pm2.config.js** (⚙️ Process Manager)
Configuración de PM2.

Configura:
- 2 instancias (cluster mode)
- Auto-restart
- Logs
- Límites de memoria

**Uso**:
```bash
pm2 start deployment/pm2.config.js
pm2 save
pm2 startup  # Seguir instrucciones
```

---

#### **.env.production.example** (🔐 Variables)
Ejemplo de variables de entorno para producción.

Incluye:
- OpenAI API Key
- Puerto del servidor
- Base de datos
- URLs
- Configuración opcional

**Uso**:
```bash
cp deployment/.env.production.example .env
nano .env  # Editar con valores reales
```

---

## 🗺️ Flujo de Trabajo Recomendado

### 1️⃣ Primera Vez (Setup Completo)

```mermaid
1. Leer HOSTING_OPTIONS.md → Elegir proveedor
2. Contratar servidor
3. Ejecutar install-server.sh
4. Subir código al servidor
5. Configurar .env
6. Ejecutar deploy.sh
7. Configurar nginx
8. Configurar SSL con certbot
9. Probar aplicación
10. Entregar según CHECKLIST_ENTREGA.md
```

**Tiempo estimado**: 1-2 horas (primera vez)

---

### 2️⃣ Actualizaciones Futuras

```mermaid
1. Conectar al servidor
2. cd /var/www/mediciones-ia
3. ./deployment/deploy.sh
4. Verificar funcionamiento
```

**Tiempo estimado**: 5 minutos

---

### 3️⃣ Backup Manual

```mermaid
1. Conectar al servidor
2. cd /var/www/mediciones-ia
3. ./deployment/backup.sh
4. Verificar en /var/backups/mediciones-ia/
```

**Tiempo estimado**: 1 minuto

---

## 🆘 Ayuda Rápida

### "¿Qué archivo necesito?"

| Situación | Archivo a leer |
|-----------|----------------|
| Nunca he hecho deployment | **QUICK_START.md** |
| No sé qué hosting elegir | **HOSTING_OPTIONS.md** |
| Necesito guía completa | **README.md** |
| Voy a entregar al cliente | **CHECKLIST_ENTREGA.md** |
| Necesito instalar servidor | Ejecutar **install-server.sh** |
| Necesito deplegar app | Ejecutar **deploy.sh** |
| Configurar Nginx | Usar **nginx.conf** |
| Configurar PM2 | Usar **pm2.config.js** |
| Variables de entorno | Copiar **.env.production.example** |

---

### "¿Qué comando ejecuto?"

| Acción | Comando |
|--------|---------|
| Instalar servidor | `./deployment/install-server.sh` |
| Deplegar/Actualizar | `./deployment/deploy.sh` |
| Backup manual | `./deployment/backup.sh` |
| Ver logs | `pm2 logs` |
| Ver estado | `pm2 status` |
| Reiniciar | `pm2 restart all` |
| Ver error de Nginx | `tail -f /var/log/nginx/error.log` |

---

## 📞 Soporte

Si tienes problemas:

1. **Revisa primero**: README.md (sección Troubleshooting)
2. **Verifica logs**: `pm2 logs`
3. **Estado del servidor**: `pm2 status` y `systemctl status nginx`
4. **Contacta**: [tu-email]

---

## 📌 Notas Importantes

### ⚠️ Antes de deployment
- [ ] Tienes servidor contratado
- [ ] Tienes acceso SSH
- [ ] Tienes dominio (opcional)
- [ ] Tienes API key de OpenAI (o cliente la proveerá)

### ⚠️ Después de deployment
- [ ] Cambiar contraseñas
- [ ] Configurar backups automáticos
- [ ] Probar todas las funcionalidades
- [ ] Documentar credenciales
- [ ] Entregar al cliente según checklist

### ⚠️ Mantenimiento regular
- Actualizar sistema: mensual
- Verificar backups: semanal
- Renovar SSL: automático (verificar anual)
- Actualizar aplicación: según necesidad

---

## 🎓 Recursos Adicionales

### Documentación Externa
- [Node.js Docs](https://nodejs.org/docs)
- [PM2 Docs](https://pm2.keymetrics.io/docs)
- [Nginx Docs](https://nginx.org/en/docs/)
- [Let's Encrypt](https://letsencrypt.org/docs/)
- [DigitalOcean Tutorials](https://www.digitalocean.com/community/tutorials)

### Comunidades
- Stack Overflow
- Reddit: r/node, r/webdev
- Discord: Node.js, PM2

---

**Versión**: 1.0
**Última actualización**: Enero 2025
**Mantenido por**: [Tu nombre]
