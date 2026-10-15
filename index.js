// JukeRex · sistema de tickets (sin base de datos: el estado vive en el tema de cada canal de ticket).
import {
  ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, ChannelType, Client, EmbedBuilder, GatewayIntentBits,
  MessageFlags, PermissionFlagsBits as P, StringSelectMenuBuilder,
} from 'discord.js';
import { readFileSync } from 'node:fs';

const COLOR = 0x22d8ff, COLOR2 = 0xd83cff;
const TAG = 'JukeRex · Your room. Your music. Your vibe.';
const CATEGORY = '⊱───── {·.TICKETS.·} ───── ⊰';
const LOG_NAME = '『🧾』ticket-logs';
const TYPES = {
  plan: { emoji: '💎', label: 'Hire a plan · Contratar un plan', short: 'plan' },
  question: { emoji: '❓', label: 'Question · Duda', short: 'duda' },
  support: { emoji: '🛠️', label: 'Support · Soporte', short: 'soporte' },
};
const logo = () => new AttachmentBuilder('./assets/logo.png', { name: 'logo.png' });
const footer = { text: TAG, iconURL: 'attachment://logo.png' };

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

const isStaff = (m) => m.permissions.has(P.Administrator) || m.roles.cache.some((r) => /staff|owner/i.test(r.name));
const staffRoles = (g) => g.roles.cache.filter((r) => /staff|owner/i.test(r.name) && !r.managed);
const parseTopic = (c) => { const [, user, claimed] = (c.topic ?? '').match(/^ticket:(\d+):?(\d+)?/) ?? []; return user ? { user, claimed } : null; };

async function ensureInfra(guild) {
  await guild.channels.fetch();
  const staff = staffRoles(guild);
  const hidden = [{ id: guild.id, deny: [P.ViewChannel] }, ...staff.map((r) => ({ id: r.id, allow: [P.ViewChannel, P.SendMessages, P.ReadMessageHistory] })), { id: client.user.id, allow: [P.ViewChannel, P.SendMessages, P.ManageChannels, P.ReadMessageHistory, P.EmbedLinks, P.AttachFiles] }];
  let cat = guild.channels.cache.find((c) => c.type === ChannelType.GuildCategory && c.name === CATEGORY);
  cat ??= await guild.channels.create({ name: CATEGORY, type: ChannelType.GuildCategory, permissionOverwrites: hidden });
  let log = guild.channels.cache.find((c) => c.name === LOG_NAME && c.type === ChannelType.GuildText);
  if (!log) {
    const staffCat = guild.channels.cache.find((c) => c.type === ChannelType.GuildCategory && /STAFF/.test(c.name));
    log = await guild.channels.create({ name: LOG_NAME, type: ChannelType.GuildText, parent: staffCat?.id, permissionOverwrites: hidden });
  }
  return { cat, log };
}

function panelMessage() {
  const embed = new EmbedBuilder().setColor(COLOR2)
    .setTitle('🎫 Open a ticket · Abre un ticket')
    .setDescription('🇬🇧 Choose the option that fits and a private channel will open with our team.\n\n🇪🇸 Elige la opción que corresponda y se abrirá un canal privado con nuestro equipo.\n\n' + Object.values(TYPES).map((t) => `${t.emoji} **${t.label}**`).join('\n'))
    .setFooter(footer);
  const menu = new StringSelectMenuBuilder().setCustomId('ticket:open').setPlaceholder('Select a reason · Elige un motivo')
    .addOptions(Object.entries(TYPES).map(([value, t]) => ({ label: t.label, value, emoji: t.emoji })));
  return { embeds: [embed], components: [new ActionRowBuilder().addComponents(menu)], files: [logo()] };
}

const controls = (claimed) => new ActionRowBuilder().addComponents(
  new ButtonBuilder().setCustomId('ticket:claim').setLabel(claimed ? 'Claimed · Reclamado' : 'Claim · Reclamar').setEmoji('🙋').setStyle(ButtonStyle.Success).setDisabled(!!claimed),
  new ButtonBuilder().setCustomId('ticket:close').setLabel('Close · Cerrar').setEmoji('🔒').setStyle(ButtonStyle.Danger),
);

async function openTicket(interaction, type) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const { guild, user } = interaction;
  const { cat } = await ensureInfra(guild);
  const existing = guild.channels.cache.find((c) => c.parentId === cat.id && parseTopic(c)?.user === user.id);
  if (existing) return interaction.editReply(`🇬🇧 You already have an open ticket: ${existing}\n🇪🇸 Ya tienes un ticket abierto: ${existing}`);
  const t = TYPES[type];
  const channel = await guild.channels.create({
    name: `${t.emoji}｜${t.short}-${user.username}`.slice(0, 100), type: ChannelType.GuildText, parent: cat.id, topic: `ticket:${user.id}`,
    permissionOverwrites: [
      { id: guild.id, deny: [P.ViewChannel] },
      { id: user.id, allow: [P.ViewChannel, P.SendMessages, P.ReadMessageHistory, P.AttachFiles, P.EmbedLinks] },
      ...staffRoles(guild).map((r) => ({ id: r.id, allow: [P.ViewChannel, P.SendMessages, P.ReadMessageHistory, P.ManageMessages] })),
      { id: client.user.id, allow: [P.ViewChannel, P.SendMessages, P.ManageChannels, P.ReadMessageHistory, P.EmbedLinks, P.AttachFiles] },
    ],
  });
  const embed = new EmbedBuilder().setColor(COLOR).setTitle(`${t.emoji} ${t.label}`)
    .setDescription(`🇬🇧 Hi ${user}! Tell us what you need (and the plan you’re interested in: GA, AP or Custom). Our team will reply as soon as possible.\n\n🇪🇸 ¡Hola ${user}! Cuéntanos qué necesitas (y el plan que te interesa: GA, AP o Personalizado). Nuestro equipo te responderá lo antes posible.`)
    .setThumbnail('attachment://logo.png').setFooter(footer);
  await channel.send({ content: `${user} ${staffRoles(guild).map((r) => r).join(' ')}`, embeds: [embed], components: [controls(false)], files: [logo()], allowedMentions: { users: [user.id], roles: staffRoles(guild).map((r) => r.id) } });
  await interaction.editReply(`✅ ${channel}`);
}

async function transcript(channel) {
  const all = []; let before;
  for (let i = 0; i < 20; i++) {
    const batch = await channel.messages.fetch({ limit: 100, before });
    if (!batch.size) break;
    all.push(...batch.values()); before = batch.last().id;
  }
  all.reverse();
  const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
  const rows = all.map((m) => {
    const body = [m.content, ...m.embeds.map((e) => [e.title, e.description].filter(Boolean).join(' — ')), ...m.attachments.map((a) => a.url)].filter(Boolean).join('\n');
    return `<div class="m"><span class="t">${m.createdAt.toISOString().replace('T', ' ').slice(0, 19)}</span> <b>${esc(m.author.tag ?? m.author.username)}</b><pre>${esc(body)}</pre></div>`;
  }).join('\n');
  const html = `<!doctype html><meta charset="utf-8"><title>${esc(channel.name)}</title><style>body{background:#0b0722;color:#e6e0ff;font:14px sans-serif;padding:24px}.m{border-bottom:1px solid #2a1d5c;padding:8px 0}.t{color:#22d8ff;font-size:12px}b{color:#d83cff}pre{margin:4px 0;white-space:pre-wrap;font:inherit}</style><h2>🦖 JukeRex · ${esc(channel.name)}</h2>${rows}`;
  return new AttachmentBuilder(Buffer.from(html), { name: `transcript-${channel.name.replace(/[^\w-]/g, '')}.html` });
}

async function closeTicket(interaction) {
  const info = parseTopic(interaction.channel);
  if (!info) return;
  if (!(isStaff(interaction.member) || interaction.user.id === info.user)) return interaction.reply({ content: '⛔ Only staff or the ticket owner can close it · Solo el staff o quien abrió el ticket.', flags: MessageFlags.Ephemeral });
  await interaction.reply('🔒 Closing in 5 seconds… · Cerrando en 5 segundos…');
  const file = await transcript(interaction.channel);
  const { log } = await ensureInfra(interaction.guild);
  const embed = new EmbedBuilder().setColor(COLOR2).setTitle('🧾 Ticket closed · cerrado')
    .addFields({ name: 'Channel', value: interaction.channel.name, inline: true }, { name: 'Opened by · Abierto por', value: `<@${info.user}>`, inline: true }, { name: 'Claimed by · Reclamado por', value: info.claimed ? `<@${info.claimed}>` : '—', inline: true }, { name: 'Closed by · Cerrado por', value: `${interaction.user}`, inline: true })
    .setFooter(footer).setTimestamp();
  await log.send({ embeds: [embed], files: [file, logo()], allowedMentions: { parse: [] } });
  const owner = await client.users.fetch(info.user).catch(() => null);
  await owner?.send({ embeds: [new EmbedBuilder().setColor(COLOR).setTitle('🦖 JukeRex').setDescription('🇬🇧 Your ticket was closed. Thanks for contacting us! Transcript attached.\n🇪🇸 Tu ticket fue cerrado. ¡Gracias por escribirnos! Adjuntamos la transcripción.').setFooter(footer)], files: [file, logo()] }).catch(() => {});
  setTimeout(() => interaction.channel.delete('Ticket cerrado').catch(() => {}), 5000);
}

client.on('interactionCreate', async (i) => {
  try {
    if (i.isChatInputCommand() && i.commandName === 'panel-tickets') {
      if (!i.memberPermissions.has(P.Administrator)) return i.reply({ content: '⛔ Admin only.', flags: MessageFlags.Ephemeral });
      await ensureInfra(i.guild);
      await i.channel.send(panelMessage());
      return i.reply({ content: '✅', flags: MessageFlags.Ephemeral });
    }
    if (i.isStringSelectMenu() && i.customId === 'ticket:open') return openTicket(i, i.values[0]);
    if (i.isButton() && i.customId === 'ticket:claim') {
      if (!isStaff(i.member)) return i.reply({ content: '⛔ Staff only · Solo staff.', flags: MessageFlags.Ephemeral });
      const info = parseTopic(i.channel);
      await i.channel.setTopic(`ticket:${info.user}:${i.user.id}`);
      await i.update({ components: [controls(true)] });
      return i.channel.send({ content: `🙋 ${i.user} claimed this ticket · tomó este ticket.`, allowedMentions: { parse: [] } });
    }
    if (i.isButton() && i.customId === 'ticket:close') return closeTicket(i);
  } catch (e) {
    console.error(e);
    const msg = { content: '⚠️ Error. Try again · Inténtalo de nuevo.', flags: MessageFlags.Ephemeral };
    if (i.deferred || i.replied) i.editReply(msg.content).catch(() => {}); else i.reply(msg).catch(() => {});
  }
});

client.once('clientReady', async () => {
  console.log(`🦖 JukeRex listo como ${client.user.tag}`);
  client.user.setPresence({ activities: [{ name: '🎶 JukeRex · tickets' }], status: 'online' });
  for (const guild of client.guilds.cache.values()) {
    await guild.commands.set([{ name: 'panel-tickets', description: 'Publica el panel de tickets en este canal · Post the ticket panel here', default_member_permissions: String(P.Administrator), dm_permission: false }]);
    await ensureInfra(guild).catch((e) => console.error('infra:', e.message));
  }
});
process.on('unhandledRejection', (e) => console.error('unhandledRejection', e));
client.login(process.env.DISCORD_TOKEN);
