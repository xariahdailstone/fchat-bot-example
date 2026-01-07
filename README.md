# F-Chat Example Bot

This repository demonstrates an implementation of a *very* simple F-Chat bot
in node.js.

This bot can connect to chat, join one or more channels, respond to
`!hello` commands in those channels, and responds to private messages by
echoing back the received message back to the sender.

Please see [here](https://xariah.net/flist-bot-tutorial) for a walkthrough
of implementing a bot like this.

## Usage

To use this bot, assign the following environment varibles:

Name | Description
--|--
`FCHAT_ACCOUNT_NAME` | The name of your F-List **account** (*not character name*)
`FCHAT_ACCOUNT_PASSWORD` | The password you use to log into F-List.
`FCHAT_CHARACTER_NAME` | The character name of the bot.

With the environment variables set, run `npm install` to install the required
WebSocket module, and then run `node bot.js`.

## Warning

This bot code is *very* simplified for clarity.  If you want to make a
robust, production-quality bot, you will need to add a lot more error-checking.

Use this code at your own risk.