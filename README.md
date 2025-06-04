# Shapes-API-Discord
Since Discord banned Shapes from the platform I decided to make a self hosted node.js Discord chat bot designed to work with Shapes.inc API. 
This should comply with their ToS now as you are hosting your own API key and such, but to be on the safe side there's no references to Shapes between the bot and Discord itself. 

Just install dependancies, npm install or npm install discord.js openai dotenv axios

Edit the .env with your relevent bot info from discord.com/developers and shapes.inc, edit index.js to change what the bot is playing.

If you get an Error 500 message in the console, try using the Account-Wide API key from Shapes instead of the Shape-Specific one. 

Discord Bot requirements:
Side menu > Bot > Privileged Gateway Intents - Enable all 3

Installation:

Installation > Guild Install ONLY

Scopes: application.commands, bot

Permissions: Add Reactions, Attach Files, Embed Links, Read Message History, Send Messages, View Channels

Copy the install link and paste it in your browser to invite the bot to your server. (I'm sure you already know this)

! commands mentioned in their API doc now also work as / commands just as they used to. Some commands like !help, !dashboard, and !info have NOT been converted into slash commands and are not recommended to use since they would show info from Shapes.

Shape voices and image generation works just as you remember it. But I don't have a freewill feature, yet, as this would likely exceed their rate limit very quickly. 

You can host this in Visual Studio Code (like I do) or on any node.js server.

Enjoy!
