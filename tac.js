/**
 * Tactical Centre — Specialisation questions editor
 * Permanent buttons in Sentinel / Driller / Top Dog / Doughboy threads.
 */
const fs = require('fs');
const path = require('path');
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  MessageFlags
} = require('discord.js');

const TAC_GUILD_ID = '1256977709884641382';
const SPECIALISATION_AUDIT_USER_ID = '295215176372846592';

const THREADS = {
  '1537574763936088124': { name: 'Sentinel', company: 'Demon' },
  '1537575040659357706': { name: 'Driller', company: 'Nightmare' },
  '1537575307056390204': { name: 'Top Dog', company: 'Cerberus' },
  '1537575804316287026': { name: 'Doughboy', company: 'Hellfire' }
};

const DATA_PATH = path.join(__dirname, 'data', 'specialisations.json');
const pendingEdits = new Map();

function loadData() {
  if (!fs.existsSync(DATA_PATH)) {
    console.warn('[TAC] specialisations.json not found at', DATA_PATH);
    return {};
  }
  return JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
}

function saveData(data) {
  const dir = path.dirname(DATA_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2), 'utf8');
}

function getCompanySpecificItems(company) {
  const data = loadData();
  const spec = data[company];
  if (!spec || !spec.sections) return [];
  const section =
    spec.sections.find((s) => s.title && s.title.includes('Company Specific')) ||
    spec.sections[spec.sections.length - 1];
  return section?.items || [];
}

function updateQuestion(company, index, newText) {
  const data = loadData();
  const spec = data[company];
  if (!spec || !spec.sections) return false;
  const section =
    spec.sections.find((s) => s.title && s.title.includes('Company Specific')) ||
    spec.sections[spec.sections.length - 1];
  if (!section || !Array.isArray(section.items) || !section.items[index]) return false;
  section.items[index] = newText;
  saveData(data);
  return true;
}

async function notifySpecialisationChange(interaction, company, index, oldText, newText) {
  try {
    const recipient = await interaction.client.users.fetch(SPECIALISATION_AUDIT_USER_ID);
    if (!recipient) {
      console.warn(`[TAC] Could not fetch audit user ${SPECIALISATION_AUDIT_USER_ID}`);
      return;
    }

    const friendlyName =
      Object.values(THREADS).find((t) => t.company === company)?.name || company;

    const embed = new EmbedBuilder()
      .setTitle('Specialization Question Changed')
      .setColor(0xf1c40f)
      .addFields(
        {
          name: 'Changed By',
          value: `${interaction.user} (${interaction.user.tag})\nID: \`${interaction.user.id}\``,
          inline: false
        },
        {
          name: 'Specialization',
          value: `${friendlyName} (${company})`,
          inline: true
        },
        {
          name: 'Question',
          value: `Question ${index + 1}`,
          inline: true
        },
        {
          name: 'Old Question',
          value: (oldText || '*empty*').slice(0, 1024),
          inline: false
        },
        {
          name: 'New Question',
          value: (newText || '*empty*').slice(0, 1024),
          inline: false
        }
      )
      .setTimestamp()
      .setFooter({ text: '1st MI Tech Support • Specialization change notification' });

    await recipient.send({
      content: '📝 A Specialization Question has been changed.',
      embeds: [embed]
    });

    console.log(`[TAC] Sent specialization change DM to ${SPECIALISATION_AUDIT_USER_ID}`);
  } catch (err) {
    // Do not fail the editor save if the audit DM cannot be delivered.
    console.error('[TAC] Failed to send specialization change DM:', err.message);
  }
}

async function postPermanentMessage(client, threadId) {
  const thread = await client.channels.fetch(threadId).catch(() => null);
  if (!thread) {
    console.error(`[TAC] Could not fetch thread ${threadId}`);
    return;
  }
  const info = THREADS[threadId];
  if (!info) return;

  try {
    const messages = await thread.messages.fetch({ limit: 30 });
    for (const msg of messages.values()) {
      if (msg.author.id === client.user.id) {
        await msg.delete().catch(() => {});
      }
    }
  } catch (err) {
    console.warn(`[TAC] Could not clean old messages in ${info.name}:`, err.message);
  }

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`tac_edit_${info.company}`)
      .setLabel(`Edit ${info.name} Questions`)
      .setStyle(ButtonStyle.Primary)
  );

  await thread.send({
    content:
      `**${info.name} Specialization Editor**\n` +
      `Only the person who clicks the button will see the editing steps.\n` +
      `The thread stays clean for everyone else.`,
    components: [row]
  });
  console.log(`[TAC] Permanent button posted in ${info.name} thread`);
}

async function handleTacInteraction(interaction) {
  if (!interaction.guildId || interaction.guildId !== TAC_GUILD_ID) return false;

  try {
    // 1. Edit button
    if (interaction.isButton() && interaction.customId.startsWith('tac_edit_')) {
      const company = interaction.customId.replace('tac_edit_', '');
      const questions = getCompanySpecificItems(company);
      if (!questions.length) {
        await interaction.reply({
          content: 'No questions found for this specialization.',
          flags: MessageFlags.Ephemeral
        });
        return true;
      }

      const options = questions.map((q, i) => {
        let description = String(q).replace(/\s+/g, ' ').trim();
        if (description.length > 90) description = description.slice(0, 87) + '...';
        return {
          label: `Question ${i + 1}`,
          description: description || 'Empty question',
          value: String(i)
        };
      });

      const select = new StringSelectMenuBuilder()
        .setCustomId(`tac_select_${company}`)
        .setPlaceholder('Select the question you want to edit')
        .addOptions(options.slice(0, 25));

      const friendlyName =
        Object.values(THREADS).find((t) => t.company === company)?.name || company;

      await interaction.reply({
        content: `**${friendlyName} Specialization**\nSelect which question you want to edit:`,
        components: [new ActionRowBuilder().addComponents(select)],
        flags: MessageFlags.Ephemeral
      });
      return true;
    }

    // 2. Select → modal
    if (interaction.isStringSelectMenu() && interaction.customId.startsWith('tac_select_')) {
      const company = interaction.customId.replace('tac_select_', '');
      const index = parseInt(interaction.values[0], 10);
      const questions = getCompanySpecificItems(company);
      const currentText = questions[index] || '';

      const modal = new ModalBuilder()
        .setCustomId(`tac_modal_${company}_${index}`)
        .setTitle(`Edit Question ${index + 1}`);

      const input = new TextInputBuilder()
        .setCustomId('new_text')
        .setLabel('New question text')
        .setStyle(TextInputStyle.Paragraph)
        .setValue(currentText.slice(0, 1000))
        .setRequired(true)
        .setMaxLength(1000);

      modal.addComponents(new ActionRowBuilder().addComponents(input));
      await interaction.showModal(modal);
      return true;
    }

    // 3. Modal → preview
    if (interaction.isModalSubmit() && interaction.customId.startsWith('tac_modal_')) {
      const parts = interaction.customId.split('_');
      // tac_modal_Company_index
      const company = parts[2];
      const index = parseInt(parts[3], 10);
      const newText = interaction.fields.getTextInputValue('new_text').trim();
      const oldText = getCompanySpecificItems(company)[index] || '';

      const key = `${interaction.user.id}_${company}_${index}`;
      pendingEdits.set(key, newText);
      setTimeout(() => pendingEdits.delete(key), 10 * 60 * 1000);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`tac_confirm_${company}_${index}`)
          .setLabel('Confirm Change')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId('tac_cancel_edit')
          .setLabel('Cancel')
          .setStyle(ButtonStyle.Secondary)
      );

      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle(`Preview — Question ${index + 1}`)
            .setColor(0x5865f2)
            .addFields(
              { name: 'Old Text', value: (oldText || '*empty*').slice(0, 1024) },
              { name: 'New Text', value: (newText || '*empty*').slice(0, 1024) }
            )
            .setFooter({ text: 'Only you can see this message' })
        ],
        components: [row],
        flags: MessageFlags.Ephemeral
      });
      return true;
    }

    // 4. Confirm
    if (interaction.isButton() && interaction.customId.startsWith('tac_confirm_')) {
      const parts = interaction.customId.split('_');
      // tac_confirm_Company_index
      const company = parts[2];
      const index = parseInt(parts[3], 10);
      const key = `${interaction.user.id}_${company}_${index}`;
      const newText = pendingEdits.get(key);

      if (!newText) {
        await interaction.update({
          content: '⏱️ This edit has expired. Please start again from the permanent button.',
          embeds: [],
          components: []
        });
        return true;
      }

      const oldText = getCompanySpecificItems(company)[index] || '';
      const success = updateQuestion(company, index, newText);
      pendingEdits.delete(key);

      if (success) {
        await interaction.update({
          content:
            `✅ **Question ${index + 1} updated successfully.**\n\n` +
            `Saved to \`data/specialisations.json\`.`,
          embeds: [],
          components: []
        });
        console.log(`[TAC] ${interaction.user.tag} updated ${company} Q${index + 1}`);
        await notifySpecialisationChange(interaction, company, index, oldText, newText);
      } else {
        await interaction.update({
          content: '❌ Failed to update the question. Please try again.',
          embeds: [],
          components: []
        });
      }
      return true;
    }

    // 5. Cancel
    if (interaction.isButton() && interaction.customId === 'tac_cancel_edit') {
      await interaction.update({
        content: 'Edit cancelled.',
        embeds: [],
        components: []
      });
      return true;
    }
  } catch (err) {
    console.error('[TAC] Interaction error:', err);
    const msg = { content: 'Something went wrong. Please try again.', flags: MessageFlags.Ephemeral };
    try {
      if (interaction.replied || interaction.deferred) await interaction.followUp(msg);
      else await interaction.reply(msg);
    } catch (_) {}
    return true;
  }

  return false;
}

async function startTac(client) {
  console.log('[TAC] Tactical Centre specialisation editor starting…');
  if (!fs.existsSync(DATA_PATH)) {
    console.warn('[TAC] Missing data/specialisations.json — editor will have no questions until file is added');
  } else {
    console.log('[TAC] Loaded specialisations.json');
  }

  for (const threadId of Object.keys(THREADS)) {
    try {
      await postPermanentMessage(client, threadId);
    } catch (err) {
      console.error(`[TAC] Failed to post in thread ${threadId}:`, err.message);
    }
  }
  console.log('[TAC] Ready');
}

module.exports = {
  startTac,
  handleTacInteraction
};
