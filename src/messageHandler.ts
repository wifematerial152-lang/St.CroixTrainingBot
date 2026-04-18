import {
  Message,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionsBitField,
  EmbedBuilder,
  Colors,
  ChannelType,
} from "discord.js";
import { logger } from "../lib/logger";
import { getAllTrainees, getAllTickets, isTrainee, getTicket, addTicket, removeTicket } from "./store";

const COMMAND_PREFIX = "!";

export async function handleMessage(message: Message): Promise<void> {
  if (message.author.bot) return;
  if (!message.content.startsWith(COMMAND_PREFIX)) return;

  const args = message.content.slice(COMMAND_PREFIX.length).trim().split(/\s+/);
  const command = args.shift()?.toLowerCase();

  try {
    switch (command) {
      case "privatetraining":
        await handleApply(message);
        break;
      case "trainingannounce":
        await handleTrainingAnnounce(message, args);
        break;
      case "codeblue":
        await handleCodeBlue(message, args);
        break;
      case "trainees":
        await handleListTrainees(message);
        break;
      case "tickets":
        await handleListTickets(message);
        break;
      case "say":
        await handleSay(message, args);
        break;
      case "help":
        await handleHelp(message);
        break;
      default:
        break;
    }
  } catch (err) {
    logger.error({ err, command }, "Error handling command");
    await message.reply("An error occurred while processing that command.").catch(() => {});
  }
}

async function handleApply(message: Message): Promise<void> {
  if (!message.guild) {
    await message.reply("This command can only be used in a server.");
    return;
  }

  if (isTrainee(message.author.id)) {
    await message.reply("You are already on the training list!");
    return;
  }

  if (getTicket(message.author.id)) {
    await message.reply("You already have an open training application. Please wait for staff to review it.");
    return;
  }

  const channel = await message.guild.channels.create({
    name: `training-${message.author.username}`,
    type: ChannelType.GuildText,
    permissionOverwrites: [
      {
        id: message.guild.id,
        deny: [PermissionsBitField.Flags.ViewChannel],
      },
      {
        id: message.author.id,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.ReadMessageHistory,
        ],
      },
    ],
  });

  // Reserve the ticket slot immediately to prevent duplicate applications
  addTicket({
    userId: message.author.id,
    username: message.author.tag,
    channelId: channel.id,
    appliedAt: new Date(),
    name: "",
    role: "",
    department: "",
    reason: "",
  });

  await message.reply(`Your private training application has started! Head to <#${channel.id}> to answer a few questions.`);
  await channel.send(`🎟️ **Private Training Application Started**`);
  await channel.send(`❓ **Question 1:** What is your name / Discord username?`);

  const data = { name: "", role: "", department: "", reason: "" };
  let step = 0;

  const collector = channel.createMessageCollector({
    filter: (m) => m.author.id === message.author.id,
    time: 600_000, // 10 minutes to complete
  });

  collector.on("collect", async (msg) => {
    if (step === 0) {
      data.name = msg.content;
      await channel.send(`❓ **Question 2:** What role are you currently?`);
      step++;
    } else if (step === 1) {
      data.role = msg.content;
      await channel.send(`❓ **Question 3:** What department and year do you need a private training for? (Nurse / Doctor / EMT)`);
      step++;
    } else if (step === 2) {
      data.department = msg.content;
      await channel.send(`❓ **Question 4:** Why do you want private training?`);
      step++;
    } else if (step === 3) {
      data.reason = msg.content;

      // Update ticket with full answers
      addTicket({
        userId: message.author.id,
        username: message.author.tag,
        channelId: channel.id,
        appliedAt: new Date(),
        name: data.name,
        role: data.role,
        department: data.department,
        reason: data.reason,
      });

      await channel.send(`✅ **Application completed! Staff will review below.**`);

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId("accept")
          .setLabel("Accept")
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId("deny")
          .setLabel("Deny")
          .setStyle(ButtonStyle.Danger)
      );

      await channel.send({
        content:
          `📄 **Application Review**\n\n` +
          `**Applicant:** <@${message.author.id}>\n` +
          `**Name:** ${data.name}\n` +
          `**Role:** ${data.role}\n` +
          `**Department:** ${data.department}\n` +
          `**Reason:** ${data.reason}`,
        components: [row],
      });

      collector.stop();
      logger.info({ userId: message.author.id, channelId: channel.id }, "Training application completed");
    }
  });

  collector.on("end", (_collected, reason) => {
    if (reason === "time") {
      channel.send("⏰ Application timed out due to inactivity. The ticket will be removed shortly.")
        .then(() => setTimeout(() => channel.delete("Application timed out").catch(() => {}), 10_000))
        .catch(() => {});
      removeTicket(message.author.id);
      logger.info({ userId: message.author.id }, "Training application timed out");
    }
  });
}

async function handleTrainingAnnounce(message: Message, args: string[]): Promise<void> {
  if (!isStaff(message)) {
    await message.reply("You do not have permission to use this command.");
    return;
  }

  if (!message.guild) {
    await message.reply("This command can only be used in a server.");
    return;
  }

  const announcement = args.join(" ");
  if (!announcement) {
    await message.reply("Usage: `!trainingannounce <message>`");
    return;
  }

  const role = message.guild.roles.cache.find((r) => r.name === "Training Accepted");
  if (!role) {
    await message.reply("The **Training Accepted** role was not found in this server.");
    return;
  }

  const members = role.members;
  if (members.size === 0) {
    await message.reply("No members have the **Training Accepted** role.");
    return;
  }

  let sent = 0;
  let failed = 0;

  for (const member of members.values()) {
    try {
      await member.send(`📢 **Private Training Alert:**\n\n${announcement}`);
      sent++;
    } catch {
      failed++;
      logger.warn({ userId: member.id }, "Could not DM member for training announcement");
    }
  }

  await message.reply(`Training announcement sent — ✅ ${sent} delivered, ❌ ${failed} failed.`);
  logger.info({ sent, failed }, "Training announcement sent");
}

async function handleCodeBlue(message: Message, args: string[]): Promise<void> {
  if (!isStaff(message)) {
    await message.reply("You do not have permission to use this command.");
    return;
  }

  const location = args.join(" ") || "Location not specified";

  const trainees = getAllTrainees();
  if (trainees.length === 0) {
    await message.reply("There are no trainees to alert.");
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle("🚨 CODE BLUE EMERGENCY ALERT")
    .setColor(Colors.Red)
    .setDescription(
      "**A Code Blue emergency has been declared!**\n\nAll available medical personnel report immediately."
    )
    .addFields(
      { name: "Location", value: location, inline: true },
      { name: "Called By", value: message.author.tag, inline: true },
      { name: "Time", value: new Date().toUTCString() }
    )
    .setFooter({ text: "Hospital Roleplay — Emergency Services" })
    .setTimestamp();

  let sent = 0;
  let failed = 0;

  for (const trainee of trainees) {
    try {
      const user = await message.client.users.fetch(trainee.userId);
      await user.send({ embeds: [embed] });
      sent++;
    } catch {
      failed++;
      logger.warn({ userId: trainee.userId }, "Could not DM trainee for Code Blue alert");
    }
  }

  await message.reply(`Code Blue alert dispatched — ✅ ${sent} notified, ❌ ${failed} failed.`);
  logger.info({ sent, failed, location }, "Code Blue alert sent");
}

async function handleListTrainees(message: Message): Promise<void> {
  if (!isStaff(message)) {
    await message.reply("You do not have permission to use this command.");
    return;
  }

  const trainees = getAllTrainees();
  if (trainees.length === 0) {
    await message.reply("There are currently no trainees on the list.");
    return;
  }

  const list = trainees
    .map((t, i) => `${i + 1}. <@${t.userId}> — accepted by ${t.acceptedBy}`)
    .join("\n");

  const embed = new EmbedBuilder()
    .setTitle("Current Trainees")
    .setColor(Colors.Blue)
    .setDescription(list)
    .setFooter({ text: `Total: ${trainees.length}` })
    .setTimestamp();

  await message.reply({ embeds: [embed] });
}

async function handleListTickets(message: Message): Promise<void> {
  if (!isStaff(message)) {
    await message.reply("You do not have permission to use this command.");
    return;
  }

  const tickets = getAllTickets();
  if (tickets.length === 0) {
    await message.reply("There are no open training applications.");
    return;
  }

  const list = tickets
    .map((t, i) => {
      const answered = t.name ? ` | Name: ${t.name} | Role: ${t.role} | Dept: ${t.department}` : " | *(answering questions…)*";
      return `${i + 1}. <@${t.userId}> — <#${t.channelId}>${answered}`;
    })
    .join("\n");

  const embed = new EmbedBuilder()
    .setTitle("Open Training Applications")
    .setColor(Colors.Yellow)
    .setDescription(list)
    .setFooter({ text: `Total: ${tickets.length}` })
    .setTimestamp();

  await message.reply({ embeds: [embed] });
}

async function handleSay(message: Message, args: string[]): Promise<void> {
  if (!isStaff(message)) {
    await message.reply("You do not have permission to use this command.");
    return;
  }

  const messageToSay = args.join(" ");
  if (!messageToSay) {
    await message.reply("❌ Please type a message for me to say.");
    return;
  }

  message.delete().catch(() => {});
  await message.channel.send(messageToSay);
}

async function handleHelp(message: Message): Promise<void> {
  const embed = new EmbedBuilder()
    .setTitle("Hospital Roleplay Bot — Commands")
    .setColor(Colors.Blurple)
    .addFields(
      {
        name: "👤 For All Members",
        value: "`!privatetraining` — Submit a training application\n`!help` — Show this help message",
      },
      {
        name: "🔐 Staff Only",
        value:
          "`!say <message>` — Make the bot say something in the channel\n" +
          "`!trainingannounce <message>` — DM all trainees with an announcement\n" +
          "`!codeblue <location>` — Send a Code Blue emergency DM alert to all trainees\n" +
          "`!tickets` — View open training applications\n" +
          "`!trainees` — View the current trainee list",
      }
    )
    .setFooter({ text: "Hospital Roleplay Training Division" })
    .setTimestamp();

  await message.reply({ embeds: [embed] });
}

function isStaff(message: Message): boolean {
  if (!message.member) return false;
  return (
    message.member.permissions.has(PermissionsBitField.Flags.ManageMessages) ||
    message.member.permissions.has(PermissionsBitField.Flags.Administrator)
  );
}
