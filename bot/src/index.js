import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, Client, EmbedBuilder, Events,
  StringSelectMenuBuilder,
  GatewayIntentBits, MessageFlags, ModalBuilder, OAuth2Scopes, PermissionFlagsBits,
  SlashCommandBuilder, TextInputBuilder, TextInputStyle,
} from 'discord.js'
import {
  GROUP_URL, findUserById, payoutEligibility, findUserByName, groupInfo, groupMembership, headshot, isValidUsername, profileUrl,
} from './roblox.js'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  dashboardEnabled, dashboardNameById, getSetting, getTransactionByRef, markProcessed, recordTransaction, setSetting, watchSettings, watchTransactions,
} from './dashboard.js'

// ---------- Konfigurasi ----------
const { DISCORD_TOKEN, GUILD_ID, TICKET_CATEGORY_ID } = process.env
// Owner yang di-tag di tiket (_justaxe_, thalviorr)
// Yang boleh mengonfirmasi pembayaran (thalviorr)
const PAYMENT_VERIFIER_IDS = (process.env.PAYMENT_VERIFIER_IDS || '').split(',').map((s) => s.trim()).filter(Boolean)
const QRIS_FILE = fileURLToPath(new URL(`../assets/${process.env.QRIS_FILE || 'qris.png'}`, import.meta.url))
const OWNER_IDS = (process.env.OWNER_USER_IDS || '').split(',').map((s) => s.trim()).filter(Boolean)
const STAFF_ROLES = (process.env.STAFF_ROLE_ID || '').split(',').map((s) => s.trim()).filter(Boolean)
if (!DISCORD_TOKEN || !GUILD_ID) {
  console.error('DISCORD_TOKEN dan GUILD_ID wajib diisi di file .env (lihat .env.example).')
  process.exit(1)
}

const GOLD = 0xc9a24a
const GREEN = 0x3fb950
const RED = 0xe5534b
const TOPIC_PREFIX = 'Tiket topup · uid:'

const BOT_PERMISSIONS = [
  PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks,
  PermissionFlagsBits.AttachFiles, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels,
  PermissionFlagsBits.ManageRoles,
]
const MEMBER_PERMISSIONS = [
  PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles,
  PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.ReadMessageHistory,
]

// ---------- Slash command ----------
const commands = [
  new SlashCommandBuilder()
    .setName('setup-tiket')
    .setDescription('Pasang panel tiket topup di channel ini')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false),
  new SlashCommandBuilder()
    .setName('testi')
    .setDescription('Minta buyer di tiket ini memberi rating & testimoni')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false),
]

// GuildMessages + MessageContent: supaya bot bisa melihat screenshot bukti transfer yang dikirim buyer
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] })

async function registerCommands(guild) {
  await guild.commands.set(commands.map((cmd) => cmd.toJSON()))
  console.log(`✅ ${client.user.tag} online di server "${guild.name}". Command /setup-tiket siap.`)
}

// Begitu bot diundang ke server, command langsung didaftarkan (tanpa restart)
client.on(Events.GuildCreate, (guild) => {
  if (guild.id === GUILD_ID) registerCommands(guild).catch(console.error)
})

client.once(Events.ClientReady, async (c) => {
  const guild = await c.guilds.fetch(GUILD_ID).catch(() => null)
  if (!guild) console.error(`Bot belum ada di server ${GUILD_ID}. Undang dulu lewat link ini:`)
  else await registerCommands(guild)
  watchTransactions(syncProcessButton)
  topupOpen = (await getSetting('topup_open', true)) !== false
  console.log(topupOpen ? '🟢 Tiket topup: BUKA' : '🔴 Tiket topup: TUTUP')
  watchSettings(async (key, value) => {
    if (key !== 'topup_open') return
    topupOpen = value !== false
    console.log(topupOpen ? '🟢 Tiket topup dibuka dari website' : '🔴 Tiket topup ditutup dari website')
    await refreshPanel()
  })
  await refreshPanel()
  console.log(dashboardEnabled ? '🔗 Terhubung ke dashboard website (Supabase).' : '⚠️  SUPABASE_SECRET_KEY belum diisi: transaksi belum tercatat otomatis ke dashboard.')
  console.log(existsSync(QRIS_FILE) ? '🧾 QRIS siap.' : `⚠️  QRIS belum ada: taruh gambar di ${QRIS_FILE}`)
  console.log('Link undang bot:', c.generateInvite({ scopes: [OAuth2Scopes.Bot, OAuth2Scopes.ApplicationsCommands], permissions: BOT_PERMISSIONS }))
})

// ---------- Helper ----------
const ticketOwnerId = (channel) => channel?.topic?.startsWith(TOPIC_PREFIX) ? channel.topic.slice(TOPIC_PREFIX.length).split(' ')[0] : null
const isStaff = (member) => member?.permissions?.has(PermissionFlagsBits.ManageGuild) || STAFF_ROLES.some((r) => member?.roles?.cache?.has(r))
const canUseTicket = (interaction) => ticketOwnerId(interaction.channel) === interaction.user.id || isStaff(interaction.member)
const ephemeral = (content) => ({ content, flags: MessageFlags.Ephemeral })

// Hapus otomatis balasan "Only you can see this" supaya tidak menumpuk
const AUTO_DISMISS_MS = 10_000
const autoDismiss = (interaction, ms = AUTO_DISMISS_MS) =>
  setTimeout(() => interaction.deleteReply().catch(() => {}), ms)

let topupOpen = true

function panelMessage(open = topupOpen) {
  if (!open) {
    const embed = new EmbedBuilder()
      .setColor(RED)
      .setTitle('Topup Robux · 2Kuli — TUTUP')
      .setDescription([
        '🔴 Layanan topup sedang **tutup** untuk sementara.',
        '',
        'Panel ini akan **otomatis buka kembali** saat layanan sudah tersedia. Terima kasih sudah menunggu!',
      ].join('\n'))
      .setFooter({ text: 'Tiket yang sudah terbuka tetap diproses seperti biasa.' })
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ticket:open').setLabel('Topup sedang tutup').setEmoji('🔒').setStyle(ButtonStyle.Secondary).setDisabled(true),
    )
    return { embeds: [embed], components: [row] }
  }
  const embed = new EmbedBuilder()
    .setColor(GOLD)
    .setTitle('Topup Robux · 2Kuli')
    .setDescription([
      '🟢 Layanan topup sedang **buka**. Klik tombol **Topup** di bawah untuk membuka tiket.',
      '',
      '**Alurnya:**',
      '1. Bot membuat channel khusus untuk kamu',
      '2. Masukkan username Roblox kamu',
      '3. Bot mengecek apakah kamu sudah join community **2Kuli Project** & eligible payout',
      '4. Pilih jumlah Robux dan lakukan pembayaran',
      '5. Owner mengirim Robux ke akunmu',
    ].join('\n'))
    .setFooter({ text: 'Hanya kamu dan admin yang bisa melihat channel tiket.' })
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ticket:open').setLabel('Topup').setEmoji('💎').setStyle(ButtonStyle.Success),
  )
  return { embeds: [embed], components: [row] }
}

/** Perbarui panel di #ticket-topup sesuai status buka/tutup */
async function refreshPanel() {
  const loc = await getSetting('topup_panel', null)
  if (!loc?.channelId || !loc?.messageId) return
  const channel = await client.channels.fetch(loc.channelId).catch(() => null)
  const msg = await channel?.messages.fetch(loc.messageId).catch(() => null)
  if (!msg) return console.warn('Panel topup tidak ditemukan. Jalankan /setup-tiket lagi.')
  await msg.edit(panelMessage())
}

function usernameButtons({ change = false } = {}) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ticket:username').setLabel(change ? 'Ganti username' : 'Masukkan username Roblox')
      .setStyle(change ? ButtonStyle.Secondary : ButtonStyle.Primary).setEmoji(change ? '✏️' : '🎮'),
    new ButtonBuilder().setCustomId('ticket:close').setLabel('Tutup tiket').setStyle(ButtonStyle.Danger).setEmoji('🔒'),
  )
}

const fmtDate = (d) => d.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) + ' WIB'

const PAYOUT_LABEL = {
  eligible: '✅ Eligible payout',
  ineligible: '❌ Belum eligible payout',
  unchecked: '⚠️ Belum bisa dicek otomatis',
}
const AUTO_CLOSE_SECONDS = 60

/**
 * Cek username → member grup → eligible payout.
 * outcome: 'not-member' | 'eligible' | 'ineligible' | 'unchecked'
 */
async function verificationMessage(user) {
  const [membership, avatar, group] = await Promise.all([groupMembership(user.id), headshot(user.id), groupInfo()])
  const payout = membership ? await payoutEligibility(user.id) : null
  const outcome = !membership ? 'not-member' : payout.status

  const embed = new EmbedBuilder()
    .setColor(outcome === 'eligible' ? GREEN : outcome === 'unchecked' ? GOLD : RED)
    .setAuthor({ name: 'Cek akun Roblox' })
    .setTitle(`${user.displayName} (@${user.name})`)
    .setURL(profileUrl(user.id))
    .addFields(
      { name: 'User ID', value: String(user.id), inline: true },
      { name: 'Community', value: group.name, inline: true },
      { name: 'Member', value: membership ? `✅ Sudah member · role **${membership.role}**` : '❌ Belum join community', inline: false },
    )
    .setFooter({ text: `Dicek ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB` })
  if (membership) embed.addFields({ name: 'Payout', value: PAYOUT_LABEL[payout.status], inline: false })
  if (avatar) embed.setThumbnail(avatar)

  const rows = []
  if (outcome === 'not-member') {
    embed.setDescription([
      `Akun ini **belum join** community **${group.name}**.`,
      '',
      '1. Buka community lewat tombol **Join community** di bawah lalu klik **Join**',
      '2. Setelah join, klik **Cek ulang**',
    ].join('\n'))
    rows.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setLabel('Join community').setStyle(ButtonStyle.Link).setURL(GROUP_URL).setEmoji('🔗'),
      new ButtonBuilder().setCustomId(`ticket:recheck:${user.id}`).setLabel('Cek ulang').setStyle(ButtonStyle.Primary).setEmoji('🔄'),
    ))
    rows.push(usernameButtons({ change: true }))
  } else if (outcome === 'eligible') {
    embed.setDescription('Akun kamu **eligible** untuk menerima payout dari community. Silakan lanjut pilih jumlah Robux di bawah 👇')
    rows.push(usernameButtons({ change: true }))
  } else if (outcome === 'ineligible') {
    embed.setDescription([
      'Mohon maaf 🙏 akun kamu **belum memenuhi syarat** untuk menerima payout Robux dari community.',
      '',
      'Roblox mewajibkan akun sudah menjadi member community **minimal 14 hari** sebelum bisa menerima payout.',
      payout.eligibleAt
        ? `Kamu join pada **${fmtDate(payout.joinedAt)}**, jadi bisa topup mulai **${fmtDate(payout.eligibleAt)}**. Silakan buka tiket baru di tanggal itu ya!`
        : 'Silakan buka tiket baru setelah 14 hari sejak kamu join. Terima kasih atas pengertiannya!',
      '',
      `Tiket ini akan ditutup otomatis dalam **${AUTO_CLOSE_SECONDS} detik**.`,
    ].join('\n'))
  } else {
    embed.setDescription('Akun kamu sudah member. Owner akan mengecek kelayakan payout secara manual, mohon tunggu ya.')
    rows.push(usernameButtons({ change: true }))
  }
  return { embeds: [embed], components: rows, outcome, payout }
}

const ownerMentions = () => OWNER_IDS.map((id) => `<@${id}>`).join(' ')

/** Lanjutan setelah cek: tag owner, atau tutup tiket kalau tidak eligible */
async function afterCheck(interaction, user, outcome, payout) {
  if (outcome === 'eligible') {
    await interaction.channel.send(orderSelectMessage(user.id, user.name))
  } else if (outcome === 'unchecked') {
    console.warn(`Cek payout gagal untuk ${user.name}:`, payout.reason)
    await interaction.followUp({
      content: `${ownerMentions()} buyer **${user.name}** sudah member. Cek eligible payout otomatis tidak tersedia, mohon **cek manual** di Roblox lalu pilih:`,
      allowedMentions: { users: OWNER_IDS },
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`order:approve:${user.id}:${user.name}`).setLabel('Eligible, lanjut pesan').setStyle(ButtonStyle.Success).setEmoji('✅'),
        new ButtonBuilder().setCustomId('order:reject').setLabel('Tidak eligible, tutup tiket').setStyle(ButtonStyle.Danger),
      )],
    })
  } else if (outcome === 'ineligible') {
    const channel = interaction.channel
    console.log(`Tiket ${channel.name}: ${user.name} tidak eligible (${payout.raw}), ditutup otomatis.`)
    setTimeout(() => channel.delete(`Buyer ${user.name} belum eligible payout`).catch(console.error), AUTO_CLOSE_SECONDS * 1000)
  }
}

// ---------- Handler ----------
client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand() && interaction.commandName === 'testi') return await startTesti(interaction)
    if (interaction.customId?.startsWith('testi:')) return await handleTesti(interaction)

    if (interaction.isChatInputCommand() && interaction.commandName === 'setup-tiket') {
      const panel = await interaction.channel.send(panelMessage())
      await setSetting('topup_panel', { channelId: panel.channelId, messageId: panel.id })
      await interaction.reply(ephemeral(`Panel tiket topup sudah dipasang (status: ${topupOpen ? 'BUKA' : 'TUTUP'}).`))
      return autoDismiss(interaction, 5000)
    }

    if (interaction.customId?.startsWith('order:')) return await handleOrder(interaction)
    if (interaction.customId?.startsWith('pay:')) return await handlePayment(interaction)
    if (interaction.customId?.startsWith('proc:')) return await handleProcess(interaction)

    if (interaction.isButton()) {
      const [, action, arg] = interaction.customId.split(':')
      if (action === 'open') return await openTicket(interaction)
      if (action === 'username') return await askUsername(interaction)
      if (action === 'recheck') return await recheck(interaction, arg)
      if (action === 'close') return await confirmClose(interaction)
      if (action === 'close-yes') return await closeTicket(interaction)
      if (action === 'close-no') return interaction.update({ content: 'Batal menutup tiket.', components: [] })
    }

    if (interaction.isModalSubmit() && interaction.customId === 'ticket:username-modal') {
      return await submitUsername(interaction)
    }
  } catch (err) {
    console.error(err)
    const text = err.code === 50013
      ? 'Bot tidak punya izin yang cukup. Admin: pastikan role bot punya izin **Manage Channels** & **Manage Roles**, dan posisinya di atas role staff.'
      : `Terjadi kesalahan: ${err.message || err}`
    const msg = ephemeral(text)
    if (interaction.deferred && !interaction.replied) await interaction.editReply(text).catch(() => {})
    else if (interaction.replied) await interaction.followUp(msg).catch(() => {})
    else if (interaction.isRepliable()) await interaction.reply(msg).catch(() => {})
  }
})

async function openTicket(interaction) {
  const { guild, user } = interaction
  if (!topupOpen) {
    await interaction.reply(ephemeral('🔴 Maaf, layanan topup sedang **tutup**. Silakan coba lagi nanti ya.'))
    return autoDismiss(interaction, 15_000)
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral })

  // Satu orang satu tiket aktif
  const channels = await guild.channels.fetch()
  const existing = channels.find((ch) => ch?.type === ChannelType.GuildText && ticketOwnerId(ch) === user.id)
  if (existing) {
    await interaction.editReply(`Kamu masih punya tiket yang terbuka: ${existing}`)
    return autoDismiss(interaction, 15_000)
  }

  const parent = await ticketParent(guild)
  const name = `topup-${user.username}`.toLowerCase().replace(/[^a-z0-9-_]/g, '').slice(0, 90) || `topup-${user.id}`
  const channel = await guild.channels.create({
    name,
    type: ChannelType.GuildText,
    parent,
    topic: `${TOPIC_PREFIX}${user.id}`,
    permissionOverwrites: [
      { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: user.id, allow: MEMBER_PERMISSIONS },
      { id: client.user.id, allow: [...MEMBER_PERMISSIONS, PermissionFlagsBits.ManageChannels] },
      ...STAFF_ROLES.map((id) => ({ id, allow: MEMBER_PERMISSIONS })),
    ],
  })

  const embed = new EmbedBuilder()
    .setColor(GOLD)
    .setTitle('Tiket topup Robux')
    .setDescription([
      `Halo ${user}, terima kasih sudah order di **2Kuli**!`,
      '',
      'Klik tombol **Masukkan username Roblox** di bawah, lalu ketik username Roblox kamu (bukan display name).',
      'Bot akan mengecek apakah akun kamu sudah join community **2Kuli Project**.',
    ].join('\n'))
  await channel.send({ content: `${user}`, embeds: [embed], components: [usernameButtons()] })
  await interaction.editReply(`Tiket kamu sudah dibuat: ${channel} (pesan ini hilang otomatis)`)
  autoDismiss(interaction, 15_000)
}

// TICKET_CATEGORY_ID boleh berisi ID kategori ATAU ID channel (dipakai kategori induknya)
async function ticketParent(guild) {
  if (!TICKET_CATEGORY_ID) return null
  const ch = await guild.channels.fetch(TICKET_CATEGORY_ID).catch(() => null)
  if (!ch) return null
  if (ch.type === ChannelType.GuildCategory) return ch.id
  return ch.parentId || null
}

async function askUsername(interaction) {
  if (!canUseTicket(interaction)) return interaction.reply(ephemeral('Hanya pembuat tiket atau admin yang bisa melakukan ini.'))
  const modal = new ModalBuilder().setCustomId('ticket:username-modal').setTitle('Username Roblox')
  modal.addComponents(new ActionRowBuilder().addComponents(
    new TextInputBuilder()
      .setCustomId('username')
      .setLabel('Username Roblox (bukan display name)')
      .setPlaceholder('contoh: lauserkd')
      .setStyle(TextInputStyle.Short)
      .setMinLength(3)
      .setMaxLength(20)
      .setRequired(true),
  ))
  return interaction.showModal(modal)
}

async function submitUsername(interaction) {
  const username = interaction.fields.getTextInputValue('username').trim().replace(/^@/, '')
  if (!isValidUsername(username)) {
    return interaction.reply(ephemeral('Username tidak valid. Gunakan 3–20 karakter: huruf, angka, atau garis bawah (_).'))
  }
  await interaction.deferReply()
  const user = await findUserByName(username)
  if (!user) {
    return interaction.editReply({
      embeds: [new EmbedBuilder().setColor(RED).setTitle('Username tidak ditemukan')
        .setDescription(`Akun Roblox **${username}** tidak ditemukan. Pastikan yang dimasukkan adalah **username**, bukan display name.`)],
      components: [usernameButtons({ change: true })],
    })
  }
  const { outcome, payout, ...msg } = await verificationMessage(user)
  await interaction.editReply(msg)
  await afterCheck(interaction, user, outcome, payout)
}

async function recheck(interaction, robloxId) {
  if (!canUseTicket(interaction)) return interaction.reply(ephemeral('Hanya pembuat tiket atau admin yang bisa melakukan ini.'))
  await interaction.deferUpdate()
  const user = await findUserById(robloxId)
  const { outcome, payout, ...msg } = await verificationMessage(user)
  await interaction.editReply(msg)
  if (outcome === 'not-member') {
    await interaction.followUp(ephemeral('Masih belum terdeteksi sebagai member. Pastikan sudah klik **Join** di halaman community, lalu cek ulang beberapa detik lagi.'))
  } else {
    await afterCheck(interaction, user, outcome, payout)
  }
}

async function confirmClose(interaction) {
  if (!canUseTicket(interaction)) return interaction.reply(ephemeral('Hanya pembuat tiket atau admin yang bisa menutup tiket ini.'))
  return interaction.reply({
    content: 'Yakin mau menutup tiket ini? Channel akan dihapus.',
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ticket:close-yes').setLabel('Ya, tutup').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('ticket:close-no').setLabel('Batal').setStyle(ButtonStyle.Secondary),
    )],
    flags: MessageFlags.Ephemeral,
  })
}

async function closeTicket(interaction) {
  if (!canUseTicket(interaction) || !ticketOwnerId(interaction.channel)) return interaction.update({ content: 'Tidak bisa menutup channel ini.', components: [] })
  await interaction.update({ content: 'Menutup tiket…', components: [] })
  await interaction.channel.send(`🔒 Tiket ditutup oleh ${interaction.user}. Channel dihapus dalam 5 detik.`)
  setTimeout(() => interaction.channel.delete(`Tiket ditutup oleh ${interaction.user.tag}`).catch(console.error), 5000)
}

// ---------- Pesanan ----------
const PRICE_PER_100 = 15_000
const ROBUX_OPTIONS = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 2500, 5000, 7500, 10000]
const priceOf = (robux) => (robux / 100) * PRICE_PER_100
const rupiah = (n) => 'Rp' + n.toLocaleString('id-ID')
const robuxText = (n) => `R$ ${n.toLocaleString('id-ID')}`

/** Step 1: pilih jumlah Robux */
function orderSelectMessage(robloxId, robloxName, selected) {
  const embed = new EmbedBuilder()
    .setColor(GOLD)
    .setAuthor({ name: 'Langkah 1 · Pilih jumlah' })
    .setTitle('Mau topup berapa Robux?')
    .setDescription([
      `Akun tujuan: **${robloxName}**`,
      `Harga: **${rupiah(PRICE_PER_100)} / 100 Robux**`,
      '',
      'Pilih jumlah Robux dari menu di bawah.',
    ].join('\n'))
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`order:select:${robloxId}:${robloxName}`)
    .setPlaceholder('Pilih jumlah Robux…')
    .addOptions(ROBUX_OPTIONS.map((n) => ({
      label: `${robuxText(n)} · ${rupiah(priceOf(n))}`,
      value: String(n),
      emoji: '💎',
      default: n === selected,
    })))
  return { embeds: [embed], components: [new ActionRowBuilder().addComponents(menu)] }
}

/** Step 2: konfirmasi pesanan */
function orderConfirmMessage(robloxId, robloxName, robux) {
  const embed = new EmbedBuilder()
    .setColor(GOLD)
    .setAuthor({ name: 'Langkah 2 · Konfirmasi pesanan' })
    .setTitle('Pastikan pesanan kamu sudah benar')
    .addFields(
      { name: 'Akun Roblox', value: robloxName, inline: true },
      { name: 'Jumlah', value: `**${robuxText(robux)}**`, inline: true },
      { name: 'Total bayar', value: `**${rupiah(priceOf(robux))}**`, inline: true },
    )
    .setDescription('Cek lagi jumlah Robux dan totalnya. Kalau sudah benar, klik **Payment** untuk lanjut ke pembayaran.')
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`order:edit:${robloxId}:${robloxName}:${robux}`).setLabel('Edit pesanan').setStyle(ButtonStyle.Primary).setEmoji('✏️'),
    new ButtonBuilder().setCustomId(`order:pay:${robloxId}:${robloxName}:${robux}`).setLabel('Payment').setStyle(ButtonStyle.Success).setEmoji('💳'),
    new ButtonBuilder().setCustomId('order:cancel').setLabel('Cancel pesanan').setStyle(ButtonStyle.Danger).setEmoji('✖️'),
  )
  return { embeds: [embed], components: [row] }
}

async function handleOrder(interaction) {
  const [, action, robloxId, robloxName, robuxStr] = interaction.customId.split(':')
  const ownerOnly = ['approve', 'reject'].includes(action)
  if (ownerOnly ? !isStaff(interaction.member) && !OWNER_IDS.includes(interaction.user.id) : !canUseTicket(interaction)) {
    return interaction.reply(ephemeral(ownerOnly ? 'Hanya owner yang bisa memilih ini.' : 'Hanya pembuat tiket yang bisa mengatur pesanan ini.'))
  }

  if (action === 'select') {
    const robux = Number(interaction.values[0])
    return interaction.update(orderConfirmMessage(robloxId, robloxName, robux))
  }
  if (action === 'edit') {
    return interaction.update(orderSelectMessage(robloxId, robloxName, Number(robuxStr)))
  }
  if (action === 'pay') {
    const robux = Number(robuxStr)
    const done = orderConfirmMessage(robloxId, robloxName, robux)
    done.embeds[0].setColor(GREEN).setAuthor({ name: 'Pesanan dikonfirmasi ✅' }).setTitle(`${robuxText(robux)} · ${rupiah(priceOf(robux))}`)
      .setDescription('Pesanan sudah dikunci.')
    await interaction.update({ embeds: done.embeds, components: [] })
    return interaction.channel.send(paymentMessage(robloxId, robloxName, robux))
  }
  if (action === 'cancel') {
    return interaction.reply({
      content: 'Yakin mau membatalkan pesanan? Tiket akan ditutup.',
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ticket:close-yes').setLabel('Ya, batalkan & tutup').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('ticket:close-no').setLabel('Tidak jadi').setStyle(ButtonStyle.Secondary),
      )],
      flags: MessageFlags.Ephemeral,
    })
  }
  if (action === 'approve') {
    await interaction.update({ content: `✅ Dicek manual oleh ${interaction.user}: eligible.`, components: [] })
    return interaction.channel.send(orderSelectMessage(robloxId, robloxName))
  }
  if (action === 'reject') {
    await interaction.update({ content: `❌ Dicek manual oleh ${interaction.user}: tidak eligible.`, components: [] })
    await interaction.channel.send('Mohon maaf 🙏 akun kamu **belum memenuhi syarat** menerima payout dari community (minimal 14 hari menjadi member). Silakan buka tiket baru nanti. Tiket ditutup dalam 60 detik.')
    setTimeout(() => interaction.channel.delete('Buyer tidak eligible (cek manual)').catch(console.error), AUTO_CLOSE_SECONDS * 1000)
  }
}

// ---------- Pembayaran ----------
const verifierMentions = () => PAYMENT_VERIFIER_IDS.map((id) => `<@${id}>`).join(' ')

// Metode pembayaran
const QRIS_ENABLED = /^(1|true|ya|yes)$/i.test(process.env.QRIS_ENABLED || '')
const BANK = {
  name: process.env.BANK_NAME || '',
  number: process.env.BANK_ACCOUNT_NUMBER || '',
  holder: process.env.BANK_ACCOUNT_NAME || '',
}
const METHOD_LABEL = { bank: 'Transfer bank', qris: 'QRIS' }

/** Step 3a: pilih metode pembayaran */
function paymentMessage(robloxId, robloxName, robux) {
  const ids = `${robloxId}:${robloxName}:${robux}`
  const embed = new EmbedBuilder()
    .setColor(GOLD)
    .setAuthor({ name: 'Langkah 3 · Pilih metode pembayaran' })
    .setTitle(`Total bayar: ${rupiah(priceOf(robux))}`)
    .setDescription([
      `Pesanan: **${robuxText(robux)}** untuk akun **${robloxName}**`,
      '',
      'Pilih metode pembayaran di bawah.',
      QRIS_ENABLED ? '' : '*QRIS belum tersedia untuk saat ini.*',
    ].join('\n'))
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`pay:bank:${ids}`).setLabel('Transfer bank').setStyle(ButtonStyle.Primary).setEmoji('🏦'),
    new ButtonBuilder().setCustomId(`pay:qris:${ids}`).setLabel(QRIS_ENABLED ? 'QRIS' : 'QRIS (segera hadir)').setStyle(ButtonStyle.Primary).setEmoji('📱')
      .setDisabled(!QRIS_ENABLED),
    new ButtonBuilder().setCustomId('order:cancel').setLabel('Cancel pesanan').setStyle(ButtonStyle.Danger).setEmoji('✖️'),
  )
  return { embeds: [embed], components: [row], files: [], attachments: [] }
}

/** Step 3b: detail pembayaran sesuai metode */
function paymentDetailMessage(method, robloxId, robloxName, robux) {
  const ids = `${robloxId}:${robloxName}:${robux}`
  const total = rupiah(priceOf(robux))
  const embed = new EmbedBuilder()
    .setColor(GOLD)
    .setAuthor({ name: `Langkah 3 · Pembayaran via ${METHOD_LABEL[method]}` })
    .setTitle(`Total bayar: ${total}`)
  let files = []

  if (method === 'bank') {
    const ready = BANK.name && BANK.number && BANK.holder
    if (!ready) console.warn('Detail rekening bank belum diisi di .env (BANK_NAME, BANK_ACCOUNT_NUMBER, BANK_ACCOUNT_NAME)')
    if (ready) {
      embed.addFields(
        { name: 'Bank', value: BANK.name, inline: true },
        { name: 'No. rekening', value: `\`${BANK.number}\``, inline: true },
        { name: 'Atas nama', value: BANK.holder, inline: true },
      )
    }
    embed.setDescription([
      `Pesanan: **${robuxText(robux)}** untuk akun **${robloxName}**`,
      '',
      ready ? `1. Transfer **tepat ${total}** ke rekening di bawah` : '1. Owner akan mengirim detail rekening di channel ini',
      '2. **Kirim screenshot bukti transfer** di channel ini',
      '3. Klik tombol **Sudah bayar**',
    ].join('\n'))
  } else {
    const hasQris = existsSync(QRIS_FILE)
    embed.setDescription([
      `Pesanan: **${robuxText(robux)}** untuk akun **${robloxName}**`,
      '',
      hasQris ? `1. Scan **QRIS** di bawah dan bayar **tepat ${total}**` : '1. Owner akan mengirim QRIS di channel ini',
      '2. **Kirim screenshot bukti pembayaran** di channel ini',
      '3. Klik tombol **Sudah bayar**',
    ].join('\n'))
    if (hasQris) {
      embed.setImage('attachment://qris.png')
      files = [{ attachment: QRIS_FILE, name: 'qris.png' }]
    }
  }

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`pay:done:${ids}:${method}`).setLabel('Sudah bayar').setStyle(ButtonStyle.Success).setEmoji('✅'),
    new ButtonBuilder().setCustomId(`pay:choose:${ids}`).setLabel('Ganti metode').setStyle(ButtonStyle.Secondary).setEmoji('🔁'),
    new ButtonBuilder().setCustomId('order:cancel').setLabel('Cancel pesanan').setStyle(ButtonStyle.Danger).setEmoji('✖️'),
  )
  return { embeds: [embed], components: [row], files, attachments: [] }
}

/** Screenshot bukti terbaru yang dikirim buyer di channel tiket */
async function findProof(channel, buyerId, messageId) {
  const isImage = (a) => (a.contentType || '').startsWith('image/')
  if (messageId) {
    const m = await channel.messages.fetch(messageId).catch(() => null)
    const a = m?.attachments.find(isImage)
    return a ? { message: m, attachment: a } : null
  }
  const msgs = await channel.messages.fetch({ limit: 50 })
  for (const m of msgs.values()) { // terbaru dulu
    if (m.author.id !== buyerId) continue
    const a = m.attachments.find(isImage)
    if (a) return { message: m, attachment: a }
  }
  return null
}

async function handlePayment(interaction) {
  const [, action, robloxId, robloxName, robuxStr, p5, p6] = interaction.customId.split(':')
  // done: p5 = metode · confirm/reject: p5 = ID pesan bukti, p6 = metode
  const proofMsgId = action === 'done' ? null : p5
  const method = (action === 'done' ? p5 : p6) || 'bank'
  const robux = Number(robuxStr)
  const amount = priceOf(robux)
  const buyerId = ticketOwnerId(interaction.channel)

  // Buyer memilih / mengganti metode pembayaran
  if (['bank', 'qris', 'choose'].includes(action)) {
    if (!canUseTicket(interaction)) return interaction.reply(ephemeral('Hanya pembuat tiket yang bisa memilih metode pembayaran.'))
    if (action === 'qris' && !QRIS_ENABLED) return interaction.reply(ephemeral('QRIS belum tersedia, silakan pakai transfer bank.'))
    if (action === 'choose') return interaction.update(paymentMessage(robloxId, robloxName, robux))
    return interaction.update(paymentDetailMessage(action, robloxId, robloxName, robux))
  }

  // Buyer klik "Sudah bayar"
  if (action === 'done') {
    if (!canUseTicket(interaction)) return interaction.reply(ephemeral('Hanya pembuat tiket yang bisa melakukan ini.'))
    const proof = await findProof(interaction.channel, buyerId)
    if (!proof) {
      await interaction.reply(ephemeral('📸 Kirim dulu **screenshot bukti transfer** di channel ini (upload gambar), lalu klik **Sudah bayar** lagi.'))
      return autoDismiss(interaction, 20_000)
    }
    await interaction.update({ components: [] })
    const embed = new EmbedBuilder()
      .setColor(GOLD)
      .setAuthor({ name: 'Menunggu konfirmasi pembayaran' })
      .setTitle(`${robuxText(robux)} · ${rupiah(amount)}`)
      .addFields(
        { name: 'Akun Roblox', value: robloxName, inline: true },
        { name: 'Buyer', value: `<@${buyerId}>`, inline: true },
        { name: 'Metode', value: METHOD_LABEL[method] || method, inline: true },
        { name: 'Bukti', value: `[Lihat screenshot](${proof.message.url})`, inline: true },
      )
      .setImage(proof.attachment.url)
      .setDescription('Buyer sudah melakukan pembayaran. Cek mutasi rekening, lalu konfirmasi.\n*Hanya Thalvior yang bisa mengonfirmasi.*')
    const ids = `${robloxId}:${robloxName}:${robux}:${proof.message.id}:${method}`
    return interaction.channel.send({
      content: `${ownerMentions()} buyer **${robloxName}** sudah bayar **${rupiah(amount)}**. Mohon dicek ya.`,
      allowedMentions: { users: OWNER_IDS },
      embeds: [embed],
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`pay:confirm:${ids}`).setLabel('Konfirmasi pembayaran').setStyle(ButtonStyle.Success).setEmoji('💰'),
        new ButtonBuilder().setCustomId(`pay:reject:${ids}`).setLabel('Pembayaran tidak valid').setStyle(ButtonStyle.Danger),
      )],
    })
  }

  // Konfirmasi / tolak: hanya thalviorr
  if (!PAYMENT_VERIFIER_IDS.includes(interaction.user.id)) {
    return interaction.reply(ephemeral('🔒 Hanya Thalvior yang bisa mengonfirmasi pembayaran.'))
  }

  if (action === 'confirm') {
    await interaction.deferUpdate()
    const proof = await findProof(interaction.channel, buyerId, proofMsgId)
    const buyer = await interaction.client.users.fetch(buyerId).catch(() => null)
    const roblox = await findUserById(robloxId).catch(() => ({ displayName: robloxName }))
    let result
    try {
      result = await recordTransaction({
        ref: `discord:${interaction.channel.id}`,
        robloxId: Number(robloxId),
        robloxName,
        displayName: roblox.displayName,
        robux,
        amount,
        notes: `${METHOD_LABEL[method] || 'Transfer'} · Tiket Discord #${interaction.channel.name}${buyer ? ` · ${buyer.username}` : ''}`,
        proof: proof ? { url: proof.attachment.url, contentType: proof.attachment.contentType } : null,
      })
    } catch (e) {
      console.error('Gagal mencatat transaksi:', e)
      return interaction.followUp(ephemeral(`❌ Gagal mencatat ke dashboard: ${e.message}\nPembayaran BELUM dikonfirmasi, coba klik lagi.`))
    }

    const done = EmbedBuilder.from(interaction.message.embeds[0])
      .setColor(GREEN)
      .setAuthor({ name: 'Pembayaran dikonfirmasi ✅' })
      .setDescription(`Dikonfirmasi oleh ${interaction.user} · ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB\n` +
        (result.duplicate ? 'Transaksi ini sudah tercatat sebelumnya di dashboard.' : `Tercatat otomatis di dashboard website${result.proofSaved ? ' (dengan foto bukti)' : ' (foto bukti gagal disimpan)'}.`))
    await interaction.editReply({ embeds: [done], components: [], content: '' })

    // Untuk buyer
    await interaction.channel.send({
      content: `<@${buyerId}>`,
      embeds: [new EmbedBuilder().setColor(GREEN).setAuthor({ name: 'Langkah 4 · Pesanan diterima' })
        .setTitle('Pesanan kamu sudah diterima 🎉')
        .setDescription([
          `Pesanan **${robuxText(robux)}** untuk akun **${robloxName}** sudah diterima dan akan segera diproses oleh ${ownerMentions()}.`,
          '',
          'Terima kasih atas pembeliannya, mohon ditunggu prosesnya ya!',
        ].join('\n'))],
    })

    // Untuk owner: tombol Proses (terhubung ke ceklis "Diproses" di dashboard)
    const tx = result.row
    const by = tx.processed ? await dashboardNameById(tx.processed_by) : null
    return interaction.channel.send({
      ...processMessage(tx, robloxName, robux, tx.processed ? { name: by || 'owner', at: tx.processed_at } : null),
      content: tx.processed ? '' : ownerMentions(),
      allowedMentions: { users: OWNER_IDS },
    })
  }

  if (action === 'reject') {
    const rejected = EmbedBuilder.from(interaction.message.embeds[0])
      .setColor(RED)
      .setAuthor({ name: 'Pembayaran tidak valid ❌' })
      .setDescription(`Ditolak oleh ${interaction.user} · ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB`)
    await interaction.update({ embeds: [rejected], components: [], content: '' })
    return interaction.channel.send({
      content: `<@${buyerId}>`,
      embeds: [new EmbedBuilder().setColor(RED).setTitle('Pembayaran belum terverifikasi')
        .setDescription(`Mohon maaf, pembayaran kamu belum bisa kami verifikasi. Pastikan nominal transfer **${rupiah(amount)}** sudah benar, kirim ulang screenshot bukti yang jelas, lalu klik **Sudah bayar** lagi.`)],
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`pay:done:${robloxId}:${robloxName}:${robux}:${method}`).setLabel('Sudah bayar').setStyle(ButtonStyle.Success).setEmoji('✅'),
        new ButtonBuilder().setCustomId('order:cancel').setLabel('Cancel pesanan').setStyle(ButtonStyle.Danger).setEmoji('✖️'),
      )],
    })
  }
}

// ---------- Proses pesanan (owner) ----------
const fmtTime = (iso) => new Date(iso).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) + ' WIB'

/** Pesan untuk owner. processed: null | { name, at, discordId? } */
function processMessage(tx, robloxName, robux, processed) {
  const embed = new EmbedBuilder()
    .setColor(processed ? GREEN : GOLD)
    .setAuthor({ name: 'Untuk owner · Proses pesanan' })
    .setTitle(`${robuxText(robux)} → ${robloxName}`)
    .setDescription(processed
      ? `✅ **Diproses oleh ${processed.name}**${processed.discordId ? ` (<@${processed.discordId}>)` : ''}${processed.at ? ` · ${fmtTime(processed.at)}` : ''}\nCeklis *Diproses* di dashboard sudah tercentang.`
      : `Kirim Robux lewat payout community, lalu klik **Proses**.\nYang pertama klik akan tercatat sebagai pemroses di dashboard (ceklis *Diproses*).\n\n${ownerMentions()}`)
  const button = new ButtonBuilder()
    .setCustomId(`proc:${tx.id}:${robloxName}:${robux}`)
    .setStyle(processed ? ButtonStyle.Secondary : ButtonStyle.Success)
    .setLabel(processed ? `Diproses oleh ${processed.name}` : 'Proses')
    .setEmoji(processed ? '🔒' : '⚙️')
    .setDisabled(!!processed)
  return {
    embeds: [embed],
    components: [new ActionRowBuilder().addComponents(button)],
    allowedMentions: { users: [] },
  }
}

/**
 * Dipanggil saat transaksi berubah di dashboard (realtime).
 * Cari pesan tombol Proses di channel tiketnya, lalu samakan tampilannya.
 */
async function syncProcessButton(tx) {
  if (!tx?.source_ref?.startsWith('discord:')) return
  const channel = await client.channels.fetch(tx.source_ref.slice('discord:'.length)).catch(() => null)
  if (!channel?.isTextBased()) return // tiket sudah ditutup
  const msgs = await channel.messages.fetch({ limit: 50 })
  const msg = msgs.find((m) => m.author.id === client.user.id &&
    m.components?.[0]?.components?.[0]?.customId?.startsWith(`proc:${tx.id}:`))
  if (!msg) return

  const button = msg.components[0].components[0]
  const [, , robloxName, robuxStr] = button.customId.split(':')
  const name = tx.processed ? (await dashboardNameById(tx.processed_by)) || 'owner' : null
  const wanted = tx.processed ? `Diproses oleh ${name}` : 'Proses'
  if (button.label === wanted && button.disabled === !!tx.processed) return // sudah sesuai

  await msg.edit(processMessage({ id: tx.id }, robloxName, Number(robuxStr), tx.processed ? { name, at: tx.processed_at } : null))
  console.log(`Sync tiket #${channel.name}: ${wanted}`)
}

async function handleProcess(interaction) {
  const [, txId, robloxName, robuxStr] = interaction.customId.split(':')
  const robux = Number(robuxStr)
  if (!OWNER_IDS.includes(interaction.user.id)) {
    return interaction.reply(ephemeral('🔒 Hanya owner (JustAxe / Thalvior) yang bisa memproses pesanan.'))
  }
  await interaction.deferUpdate()
  const r = await markProcessed(txId, interaction.user.id)

  if (r.ok) {
    await interaction.editReply(processMessage({ id: txId }, robloxName, robux, { name: r.name, at: new Date().toISOString(), discordId: interaction.user.id }))
    return
  }
  if (r.reason === 'already') {
    // Sudah diproses (dari Discord atau dari website) → kunci tombolnya
    await interaction.editReply(processMessage({ id: txId }, robloxName, robux, { name: r.name, at: r.at }))
    return interaction.followUp(ephemeral(`Pesanan ini sudah diproses oleh **${r.name}**.`))
  }
  const why = {
    unmapped: 'Akun Discord kamu belum dihubungkan ke akun dashboard (OWNER_ACCOUNTS di .env bot).',
    'no-account': 'Akun dashboard kamu tidak ditemukan di Supabase.',
    'not-found': 'Transaksi ini tidak ditemukan di dashboard (mungkin sudah dihapus).',
  }[r.reason]
  return interaction.followUp(ephemeral(`❌ ${why}`))
}

// ---------- Testimoni ----------
const TESTI_TIMEOUT_MS = 3 * 60 * 1000
const TESTI_DEFAULT_STARS = 5
const TICKET_CLOSE_AFTER_TESTI_S = 30
const stars = (n) => '⭐'.repeat(n)
const pendingTesti = new Map() // channelId → { buyerId, robux, rating, timer, messageId, done }

/** Jumlah Robux pesanan di tiket ini: dari dashboard, kalau tidak ada dari tombol Proses */
async function ticketRobux(channel) {
  const tx = await getTransactionByRef(`discord:${channel.id}`).catch(() => null)
  if (tx) return Number(tx.robux)
  const msgs = await channel.messages.fetch({ limit: 50 })
  for (const m of msgs.values()) {
    const id = m.components?.[0]?.components?.[0]?.customId || ''
    if (m.author.id === client.user.id && id.startsWith('proc:')) return Number(id.split(':')[3])
  }
  return null
}

/** Channel #testimoni: dari TESTIMONI_CHANNEL_ID, dicari dari nama, atau dibuat otomatis (read-only) */
async function testimoniChannel(guild) {
  if (process.env.TESTIMONI_CHANNEL_ID) {
    const ch = await guild.channels.fetch(process.env.TESTIMONI_CHANNEL_ID).catch(() => null)
    if (ch) return ch
  }
  const all = await guild.channels.fetch()
  const found = all.find((c) => c?.type === ChannelType.GuildText && c.name === 'testimoni')
  if (found) return found
  return guild.channels.create({
    name: 'testimoni',
    type: ChannelType.GuildText,
    topic: 'Testimoni pembeli Robux 2Kuli ⭐',
    permissionOverwrites: [
      { id: guild.roles.everyone.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory], deny: [PermissionFlagsBits.SendMessages] },
      { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks] },
    ],
  })
}

async function startTesti(interaction) {
  if (!OWNER_IDS.includes(interaction.user.id)) return interaction.reply(ephemeral('🔒 Hanya owner yang bisa memakai /testi.'))
  const buyerId = ticketOwnerId(interaction.channel)
  if (!buyerId) return interaction.reply(ephemeral('Pakai /testi di dalam channel tiket buyer.'))
  if (pendingTesti.has(interaction.channel.id)) return interaction.reply(ephemeral('Permintaan testimoni di tiket ini masih berjalan.'))

  const robux = await ticketRobux(interaction.channel)
  const row = new ActionRowBuilder().addComponents(
    [1, 2, 3, 4, 5].map((n) => new ButtonBuilder().setCustomId(`testi:rate:${n}`).setLabel(String(n)).setEmoji('⭐')
      .setStyle(n === 5 ? ButtonStyle.Success : ButtonStyle.Secondary)),
  )
  const embed = new EmbedBuilder()
    .setColor(GOLD)
    .setAuthor({ name: 'Langkah terakhir · Testimoni' })
    .setTitle('Robux sudah dikirim! Bagaimana pelayanan kami?')
    .setDescription([
      'Pilih **bintang 1–5**, lalu tulis pesan singkat (opsional).',
      'Testimoni kamu akan tampil di **#testimoni**.',
      '',
      `*Kalau belum memberi rating dalam 3 menit, otomatis terisi ${stars(TESTI_DEFAULT_STARS)}.*`,
    ].join('\n'))
  await interaction.reply({ content: `<@${buyerId}>`, embeds: [embed], components: [row] })
  const msg = await interaction.fetchReply()

  const channel = interaction.channel
  const state = { buyerId, robux, rating: null, messageId: msg.id, done: false }
  state.timer = setTimeout(() => finishTesti(channel, state.rating ?? TESTI_DEFAULT_STARS, '', true).catch(console.error), TESTI_TIMEOUT_MS)
  pendingTesti.set(channel.id, state)
}

async function handleTesti(interaction) {
  const [, action, n] = interaction.customId.split(':')
  const state = pendingTesti.get(interaction.channel.id)
  if (!state) return interaction.reply(ephemeral('Permintaan testimoni ini sudah selesai.'))
  if (interaction.user.id !== state.buyerId) return interaction.reply(ephemeral('Hanya buyer yang bisa memberi rating.'))
  const rating = Math.min(5, Math.max(1, Number(n)))

  if (action === 'rate') {
    state.rating = rating // tersimpan walau buyer menutup form pesan
    const modal = new ModalBuilder().setCustomId(`testi:submit:${rating}`).setTitle(`Rating ${stars(rating)}`)
    modal.addComponents(new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('message').setLabel('Pesan (opsional)').setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('Contoh: Prosesnya cepat, adminnya ramah!').setRequired(false).setMaxLength(300),
    ))
    return interaction.showModal(modal)
  }
  if (action === 'submit' && interaction.isModalSubmit()) {
    await interaction.deferUpdate()
    return finishTesti(interaction.channel, rating, interaction.fields.getTextInputValue('message').trim(), false)
  }
}

async function finishTesti(channel, rating, message, auto) {
  const state = pendingTesti.get(channel.id)
  if (!state || state.done) return
  state.done = true
  clearTimeout(state.timer)
  pendingTesti.delete(channel.id)

  const buyer = await client.users.fetch(state.buyerId).catch(() => null)
  const name = buyer?.globalName || buyer?.username || 'Buyer'

  // Kirim ke #testimoni: username Discord, bintang, jumlah Robux
  const embed = new EmbedBuilder()
    .setColor(GOLD)
    .setAuthor({ name, iconURL: buyer?.displayAvatarURL() })
    .setTitle(`${stars(rating)}  ${rating}/5`)
    .addFields({ name: 'Membeli', value: state.robux ? `**${robuxText(state.robux)}**` : '–', inline: true })
    .setTimestamp(new Date())
  if (message) embed.setDescription(`“${message}”`)
  if (auto) embed.setFooter({ text: 'Rating otomatis' })
  const target = await testimoniChannel(channel.guild)
  await target.send({ embeds: [embed] })

  // Tutup tombol rating di tiket
  const prompt = await channel.messages.fetch(state.messageId).catch(() => null)
  if (prompt) {
    await prompt.edit({
      embeds: [EmbedBuilder.from(prompt.embeds[0]).setColor(GREEN).setTitle(`Terima kasih! Rating ${stars(rating)} terkirim`)
        .setDescription(`${auto ? 'Rating otomatis terisi karena tidak ada respon dalam 3 menit.\n' : ''}Testimoni sudah tampil di ${target}. Sampai jumpa lagi 💛`)],
      components: [],
    })
  }

  // Selesai → tutup tiket otomatis
  await channel.send(`🔒 Pesanan selesai. Tiket ini akan ditutup otomatis dalam ${TICKET_CLOSE_AFTER_TESTI_S} detik. Terima kasih sudah belanja di 2Kuli!`)
  setTimeout(() => channel.delete('Pesanan selesai (testimoni terkirim)').catch(console.error), TICKET_CLOSE_AFTER_TESTI_S * 1000)
}

// Jangan sampai bot mati karena satu error
client.on(Events.Error, (e) => console.error('Discord error:', e))
process.on('unhandledRejection', (e) => console.error('Unhandled:', e))

client.login(DISCORD_TOKEN)
