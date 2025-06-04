// index.js
require('dotenv').config();
const { Client, GatewayIntentBits, ActivityType, SlashCommandBuilder, AttachmentBuilder } = require('discord.js');
const { OpenAI } = require('openai');
const axios = require('axios');

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
    console.log(`Logged in as ${client.user.username}`); // Updated to use username
    // Set bot activity
    client.user.setActivity({
        type: ActivityType.Playing, // Other ActivityType's are Listening, Watching, Streaming, Competing, Custom
        name: 'Your Game or Activity Here',
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

        // Extract and process the response
        const reply = response.choices[0]?.message?.content || 'No response from Shapes API.';
        console.log(`Shapes API response: ${reply}`); // Debug log
        const urlMatch = reply.match(/(https:\/\/files\.shapes\.inc\/([^\s\/]+?)\.(mp3|png))/i);
        if (urlMatch) {
            const fileUrl = urlMatch[0];
            // Extract filename and extension using split for reliability
            const urlParts = fileUrl.split('/');
            const extractedFileName = urlParts[urlParts.length - 1]; // e.g., 61c9b56a.png
            const fileExtension = extractedFileName.split('.').pop().toLowerCase(); // e.g., png
            console.log(`Detected file: ${fileUrl}, name: ${extractedFileName}, extension: ${fileExtension}`);

            // Remove the URL from the reply to get the text message
            const textMessage = reply.replace(fileUrl, '').trim();
            console.log(`Text message: ${textMessage}`);

            // Send the text message first
            await interaction.editReply(textMessage || 'Here’s your file:');

            // Download the file
            const fileResponse = await axios.get(fileUrl, { responseType: 'arraybuffer' });
            const fileBuffer = Buffer.from(fileResponse.data);
            const attachment = new AttachmentBuilder(fileBuffer, { name: extractedFileName });

            // Send the file in a follow-up message (editReply can't be called twice)
            await interaction.followUp({
                content: fileExtension === 'mp3' ? 'Generated audio:' : 'Generated image:',
                files: [attachment],
            });
        } else {
            await interaction.editReply(reply);
        }
    } catch (error) {
        console.error(`Error for user ${interaction.user.username}:`, error.message); // Updated to use username
        await interaction.editReply('Oops, something went wrong!');
    }
});

// Handle incoming messages
client.on('messageCreate', async (message) => {
    // Ignore messages from bots
    if (message.author.bot) return;

    // Debug: Log that the message was received
    console.log(`Message received: ${message.content}, author: ${message.author.username}`); // Updated to use username

    // Check if the bot is mentioned, replied to, or a command is used
    const isMentioned = message.mentions.has(client.user, { ignoreRoles: true, ignoreEveryone: true }) ||
                       message.content.includes(`<@${client.user.id}>`) ||
                       message.content.includes(`<@!${client.user.id}>`);
    const isReplyToBot = message.reference && (await message.fetchReference().catch(() => null))?.author.id === client.user.id;
    const isCommand = message.content.startsWith('!');

    console.log(`isMentioned: ${isMentioned}, isReplyToBot: ${isReplyToBot}, isCommand: ${isCommand}`); // Debug log

    // Only process if the bot is mentioned, replied to, or a command with mention/reply
    if (!isMentioned && !isReplyToBot && (!isCommand || (isCommand && !isMentioned && !isReplyToBot))) {
        console.log('Message ignored due to lack of mention, reply, or command criteria.');
        return;
    }

    // Get message content (remove bot mention if present, keep content for commands)
    let userContent = isCommand ? message.content.slice(1).trim() : message.content.replace(/<@!?[0-9]+>/g, '').trim();

    const shapeUsername = process.env.SHAPESINC_SHAPE_USERNAME;

    try {
        // Simulate typing
        await message.channel.sendTyping();

        // Debug: Log attachment details for the current message
        console.log(`Current message attachments size: ${message.attachments.size}`);
        if (message.attachments.size > 0) {
            console.log('Current message attachments:', [...message.attachments.values()].map(att => ({
                name: att.name,
                contentType: att.contentType,
                url: att.url
            })));
        }

        // Check if this message is a reply to another message
        let repliedMessageContent = '';
        let repliedMessageAttachments = [];
        if (message.reference) {
            const repliedMessage = await message.fetchReference().catch(() => null);
            if (repliedMessage) {
                console.log(`Replied to message by ${repliedMessage.author.username}: ${repliedMessage.content}`); // Updated to use username
                // Get text content from the replied-to message
                repliedMessageContent = repliedMessage.content ? `Replied message from ${repliedMessage.author.username}: ${repliedMessage.content}\n` : '';
                // Get attachments from the replied-to message
                if (repliedMessage.attachments.size > 0) {
                    repliedMessageAttachments = [...repliedMessage.attachments.values()];
                    console.log('Replied message attachments:', repliedMessageAttachments.map(att => ({
                        name: att.name,
                        contentType: att.contentType,
                        url: att.url
                    })));
                }
            } else {
                console.log('Could not fetch replied-to message.');
            }
        }

        // Combine user content with replied message content
        let content = repliedMessageContent + (userContent || 'What’s up?'); // Default if no text content

        // Prepare headers for user and channel identification
        const headers = {
            'X-User-Id': message.author.id,
            'X-Channel-Id': message.channel.id,
        };

        // Prepare the message content for the Shapes API
        let messageContent = [{ role: 'user', content }];

        // Combine attachments from both the current message and the replied-to message
        const allAttachments = [...message.attachments.values(), ...repliedMessageAttachments];
        console.log(`Total attachments to process: ${allAttachments.length}`);

        // Process attachments (if any)
        if (allAttachments.length > 0) {
            const attachment = allAttachments[0]; // Process the first attachment
            console.log(`Processing attachment - contentType: ${attachment.contentType}, filename: ${attachment.name}, url: ${attachment.url}`); // Debug log

            // Check for image
            if (attachment.contentType?.startsWith('image/')) {
                messageContent = [
                    {
                        role: 'user',
                        content: [
                            { type: 'text', text: content || 'What’s in this image?' },
                            { type: 'image_url', image_url: { url: attachment.url } },
                        ],
                    },
                ];
            }
            // Check for audio
            else {
                // Rely primarily on file extension, with contentType as a secondary check
                const fileExtension = (attachment.name || '').split('.').pop()?.toLowerCase() || '';
                const isAudioByContentType = attachment.contentType?.startsWith('audio/');
                const isSupportedAudio = 
                    ['mp3', 'wav', 'ogg'].includes(fileExtension) ||
                    (isAudioByContentType && ['audio/mp3', 'audio/mpeg', 'audio/wav', 'audio/ogg'].includes(attachment.contentType));

                console.log(`Audio check - fileExtension: ${fileExtension}, isAudioByContentType: ${isAudioByContentType}, isSupportedAudio: ${isSupportedAudio}`); // Debug log

                if (isSupportedAudio) {
                    messageContent = [
                        {
                            role: 'user',
                            content: [
                                { type: 'text', text: content || 'Please transcribe and respond to this audio.' },
                                { type: 'audio_url', audio_url: { url: attachment.url } },
                            ],
                        },
                    ];
                } else {
                    await message.channel.sendTyping();
                    await message.reply('Sorry, only mp3, wav, or ogg audio formats are supported.');
                    return;
                }
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

        // Extract and process the response
        const reply = response.choices[0]?.message?.content || 'No response from Shapes API.';
        console.log(`Shapes API response: ${reply}`); // Debug log
        const urlMatch = reply.match(/(https:\/\/files\.shapes\.inc\/([^\s\/]+?)\.(mp3|png))/i);
        if (urlMatch) {
            const fileUrl = urlMatch[0];
            // Extract filename and extension using split for reliability
            const urlParts = fileUrl.split('/');
            const extractedFileName = urlParts[urlParts.length - 1]; // e.g., 61c9b56a.png
            const fileExtension = extractedFileName.split('.').pop().toLowerCase(); // e.g., png
            console.log(`Detected file: ${fileUrl}, name: ${extractedFileName}, extension: ${fileExtension}`);

            // Remove the URL from the reply to get the text message
            const textMessage = reply.replace(fileUrl, '').trim();
            console.log(`Text message: ${textMessage}`);

            // Download the file
            const fileResponse = await axios.get(fileUrl, { responseType: 'arraybuffer' });
            const fileBuffer = Buffer.from(fileResponse.data);
            const attachment = new AttachmentBuilder(fileBuffer, { name: extractedFileName });

            // Send the text and file in the same message
            await message.reply({
                content: textMessage || (fileExtension === 'mp3' ? 'Generated audio:' : 'Generated image:'),
                files: [attachment],
            });
        } else {
            await message.reply(reply);
        }
    } catch (error) {
        console.error(`Error for user ${message.author.username}:`, error.message); // Updated to use username
        await message.channel.sendTyping();
        await message.reply('Oops, something went wrong! Try again later.');
    }
});

// Log in to Discord
client.login(process.env.DISCORD_TOKEN);