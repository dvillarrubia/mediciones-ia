#!/bin/bash
# Reset de contraseña de usuario en el servidor
# Uso: ./scripts/reset-password.sh <email> <nueva_contraseña>

EMAIL="$1"
NEW_PASSWORD="$2"

if [ -z "$EMAIL" ] || [ -z "$NEW_PASSWORD" ]; then
  echo "Uso: ./scripts/reset-password.sh <email> <nueva_contraseña>"
  echo "Ejemplo: ./scripts/reset-password.sh marradi@ilerna.com MiNuevaPass123"
  exit 1
fi

if [ ${#NEW_PASSWORD} -lt 6 ]; then
  echo "Error: La contraseña debe tener al menos 6 caracteres"
  exit 1
fi

echo "Reseteando contraseña de: $EMAIL"

ssh -i ~/.ssh/vps_deploy root@srv817047.hstgr.cloud "docker exec \$(docker ps -q --filter 'name=mediciones') node -e \"
const sqlite3 = require('sqlite3');
const bcrypt = require('bcryptjs');

const email = '$EMAIL'.toLowerCase();
const newPassword = '$NEW_PASSWORD';

const db = new sqlite3.Database('/app/data/analysis.db');

db.get('SELECT id, name FROM users WHERE email = ?', [email], (err, user) => {
  if (err) { console.error('Error:', err); db.close(); process.exit(1); }
  if (!user) { console.error('Usuario no encontrado:', email); db.close(); process.exit(1); }

  console.log('Usuario encontrado:', user.name, '(' + email + ')');

  bcrypt.hash(newPassword, 12).then(hash => {
    db.run('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?',
      [hash, new Date().toISOString(), user.id], function(err) {
        if (err) { console.error('Error actualizando:', err); db.close(); process.exit(1); }
        console.log('Contraseña actualizada correctamente');
        db.run('DELETE FROM sessions WHERE user_id = ?', [user.id], function(err2) {
          if (!err2) console.log('Sesiones cerradas:', this.changes);
          db.close();
        });
    });
  });
});
\""
