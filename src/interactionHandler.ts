import { Interaction, TextChannel, EmbedBuilder, Colors } from "discord.js";
import { logger } from "../lib/logger";
import { addTrainee, removeTicket, getTicketByChannelId, isTrainee } from "./store";

export async function handleInteraction(interaction: Interaction): Promise<void> {
  if (!interaction.isButton()) return;
  if (!interaction.guild || !interaction.channel) return;

  const channel = interaction.channel as TextChannel;
  const data = getTicketByChannelId(channel.id);

  if (!data) {
    await interaction.reply({ content: "No application found for this channel.", ephemeral: true });
    return;
  }

  try {
    const member = await interaction.guild.members.fetch(data.userId);

    if (interaction.customId === "accept") {
      if (isTrainee(data.userId)) {
        await interaction.reply({ content: "This user is already on the training list.", ephemeral: true });
        return;
      }

      // Assign the "Training Accepted" role if it exists
      const role = interaction.guild.roles.cache.find((r) => r.name === "Training Accepted");
      if (role) {
        await member.roles.add(role).catch((err) => {
          logger.warn({ err, userId: data.userId }, "Could not assign Training Accepted role");
        });
      } else {
        logger.warn("Role 'Training Accepted' not found in server — skipping role assignment");
      }

      // Add to training list
      addTrainee({
        userId: data.userId,
        username: data.username,
        acceptedAt: new Date(),
        acceptedBy: interaction.user.tag,
      });
      removeTicket(data.userId);

      // DM the applicant
      const nowUnix = Math.floor(Date.now() / 1000);
      const dmEmbed = new EmbedBuilder()
        .setTitle("Congratulations — Training Application Accepted!")
        .setColor(Colors.Green)
        .setDescription(
          `Hi **${member.displayName}**!\n\n` +
          "You have been accepted into the hospital roleplay training program.\n\n" +
          "You will receive training announcements and Code Blue alerts via DM. Stand by for further instructions from staff."
        )
        .addFields({ name: "Accepted At", value: `<t:${nowUnix}:F>` })
        .setTimestamp();

      await member.send({ embeds: [dmEmbed] }).catch(() => {
        logger.warn({ userId: data.userId }, "Could not DM accepted user — DMs may be disabled");
      });

      await interaction.reply("Application ACCEPTED ✅");
      await channel.delete("Training application accepted");

      logger.info({ userId: data.userId, acceptedBy: interaction.user.id }, "User accepted into training");

    } else if (interaction.customId === "deny") {
      removeTicket(data.userId);

      // DM the applicant
      await member.send("❌ Your private training application was denied.").catch(() => {
        logger.warn({ userId: data.userId }, "Could not DM denied user — DMs may be disabled");
      });

      await interaction.reply("Application DENIED ❌");
      await channel.delete("Training application denied");

      logger.info({ userId: data.userId, deniedBy: interaction.user.id }, "User denied via button");
    }
  } catch (err) {
    logger.error({ err, channelId: channel.id }, "Error handling button interaction");
    await interaction.reply({ content: "An error occurred processing this application.", ephemeral: true }).catch(() => {});
  }
}
