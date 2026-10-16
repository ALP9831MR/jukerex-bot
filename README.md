# JukeRex Bot

Bot de tickets del servidor de Discord de JukeRex (discord.js v14).

- Panel con menú (contratar un plan, duda, soporte) → canal privado con el staff.
- Botones para reclamar y cerrar; al cerrar, transcripción HTML al canal `ticket-logs` y por DM.
- Sin base de datos: el estado vive en el tema de cada canal de ticket.

## Despliegue (Pterodactyl, egg Node.js)

- Git address: este repositorio · Branch: `main` · Archivo principal: `index.js` · Auto update: sí.
- Token: variable de entorno `DISCORD_TOKEN` o, si el egg no la ofrece, un archivo `.env` en la carpeta del servidor con `DISCORD_TOKEN=...` (nunca se sube al repo).
- En Developer Portal → Bot, activar **Message Content Intent** (para las transcripciones).
- En Discord, el comando `/panel-tickets` (admin) publica el panel en el canal actual.
