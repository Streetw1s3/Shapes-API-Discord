// index.js
require('dotenv').config();
const { Client, GatewayIntentBits, ActivityType, SlashCommandBuilder } = require('discord.js');
const { OpenAI } = require('openai');

// Initialize Discord client with additional GuildMembers intent
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers, // For mention detection
    ],
});

// Initialize Shapes API client
const shapesClient = new OpenAI({
    apiKey: process.env.SHAPESINC_API_KEY,
    baseURL: 'https://api.shapes.inc/v1',
});

// Bot ready
client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}`);
    // Set bot activity
    client.user.setActivity({
        type: ActivityType.Playing, // Other ActivityType's are Listening, Watching, Streaming, Competing, Custom
        name: 'Your Game Name or Activity',
    });

    // Register slash commands
    const commands = [
        new SlashCommandBuilder()
            .setName('reset')
            .setDescription('Reset the Shape\'s long-term memory'),
        new SlashCommandBuilder()
            .setName('sleep')
            .setDescription('Generate a long-term memory on demand'),
        new SlashCommandBuilder()
            .setName('web')
            .setDescription('Search the web')
            .addStringOption(option =>
                option.setName('query')
                    .setDescription('Search query')
                    .setRequired(true)),
        new SlashCommandBuilder()
            .setName('imagine')
            .setDescription('Generate an image')
            .addStringOption(option =>
                option.setName('prompt')
                    .setDescription('Image description')
                    .setRequired(true)),
        new SlashCommandBuilder()
            .setName('wack')
            .setDescription('Reset the Shape\'s short-term memory'),
        new SlashCommandBuilder()
            .setName('invite')
            .setDescription('Get the bot\'s invite link'),
    ];

    try {
        await client.application.commands.set(commands);
        console.log('Slash commands registered successfully!');
    } catch (error) {
        console.error('Error registering slash commands:', error.message);
    }

    console.log('Bot is online and playing!');
});

// Handle slash commands
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    await interaction.deferReply(); // Defer to avoid timeout during API call
    const shapeUsername = process.env.SHAPESINC_SHAPE_USERNAME;

    try {
        if (interaction.commandName === 'invite') {
            const inviteUrl = process.env.BOT_INVITE_URL || 'No invite URL configured.';
            await interaction.editReply(`Invite me to your server: ${inviteUrl}`);
            return;
        }

        // Prepare headers for user and channel identification
        const headers = {
            'X-User-Id': interaction.user.id,
            'X-Channel-Id': interaction.channel.id,
        };

        // Map slash command to Shapes API command
        let content;
        switch (interaction.commandName) {
            case 'reset':
                content = '!reset';
                break;
            case 'sleep':
                content = '!sleep';
                break;
            case 'web':
                content = `!web ${interaction.options.getString('query')}`;
                break;
            case 'imagine':
                content = `!imagine ${interaction.options.getString('prompt')}`;
                break;
            case 'wack':
                content = '!wack';
                break;
            default:
                await interaction.editReply('Unknown command.');
                return;
        }

        // Send to Shapes API
        const response = await shapesClient.chat.completions.create(
            {
                model: `shapesinc/${shapeUsername}`,
                messages: [{ role: 'user', content }],
            },
            { headers }
        );

        // Extract and send the response
        const reply = response.choices[0]?.message?.content || 'No response from Shapes API.';
        await interaction.editReply(reply);
    } catch (error) {
        console.error('Error:', error.message);
        await interaction.editReply('Oops, something went wrong!');
    }
});

// Handle incoming messages
client.on('messageCreate', async (message) => {
    // Ignore messages from bots
    if (message.author.bot) return;

    // Check if the bot is mentioned, replied to, or a command is used
    const isMentioned = message.mentions.has(client.user, { ignoreRoles: true, ignoreEveryone: true }) || 
                       message.content.includes(`<@${client.user.id}>`) || 
                       message.content.includes(`<@!${client.user.id}>`);
    const isReplyToBot = message.reference && (await message.fetchReference().catch(() => null))?.author.id === client.user.id;
    const isCommand = message.content.startsWith('!');

    // Only process if the bot is mentioned, replied to, or a command with mention/reply
    if (!isMentioned && !isReplyToBot && (!isCommand || (isCommand && !isMentioned && !isReplyToBot))) return;

    // Get message content (remove bot mention if present, keep content for commands)
    let content = isCommand ? message.content.slice(1).trim() : message.content.replace(/<@!?[0-9]+>/g, '').trim();
    if (!content && !message.attachments.size) content = 'What’s up?'; // Default if no text content

    const shapeUsername = process.env.SHAPESINC_SHAPE_USERNAME;

    try {
        // Simulate typing
        await message.channel.sendTyping();

        // Prepare headers for user and channel identification
        const headers = {
            'X-User-Id': message.author.id,
            'X-Channel-Id': message.channel.id,
        };

        // Prepare the message content for the Shapes API
        let messageContent = [{ role: 'user', content }];

        // Check for image attachments
        if (message.attachments.size > 0) {
            const attachment = message.attachments.first();
            if (attachment.contentType.startsWith('image/')) {
                messageContent = [
                    {
                        role: 'user',
                        content: [
                            { type: 'text', text: content || 'What’s in this image?' },
                            { type: 'image_url', image_url: { url: attachment.url } },
                        ],
                    },
                ];
            } else {
                await message.channel.sendTyping();
                await message.reply('Sorry, only image attachments are supported.');
                return;
            }
        }

        // Handle !imagine command for backward compatibility
        if (isCommand && content.toLowerCase().startsWith('imagine')) {
            const imaginePrompt = content.slice(7).trim();
            if (!imaginePrompt) {
                await message.channel.sendTyping();
                await message.reply('Please provide a description for the image (e.g., `!imagine a futuristic city`).');
                return;
            }
            messageContent = [{ role: 'user', content: `!imagine ${imaginePrompt}` }];
        }

        // Send message to Shapes API
        const response = await shapesClient.chat.completions.create(
            {
                model: `shapesinc/${shapeUsername}`,
                messages: messageContent,
            },
            { headers }
        );

        // Extract and send the response
        const reply = response.choices[0]?.message?.content || 'No response from Shapes API.';
        await message.reply(reply);
    } catch (error) {
        console.error('Error:', error.message);
        await message.channel.sendTyping();
        await message.reply('Oops, something went wrong! Try again later.');
    }
});

// Log in to Discord
client.login(process.env.DISCORD_TOKEN);