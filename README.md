# Weekly Scheduler Telegram Bot

A Telegram bot that helps Muslim users manage their weekly schedules, integrating prayer times automatically.

## Features

- Automatic fetching of prayer times for Tashkent from [namozvaqti.uz](https://namozvaqti.uz/oylik/12/toshkent).
- Build, edit, delete, and export weekly schedules.
- Add custom activities with specific durations and frequencies.
- Export schedules as images and PDFs.

## Installation

1. Clone the repository:

```bash

git clone https://github.com/yourusername/weekly-scheduler-tg-bot.git

cd weekly-scheduler-tg-bot

```

2. Install dependencies:

```bash

npm install

```

3. Configure environment variables:

- Create a `.env` file in the root directory.
- Add your Telegram bot token:

```

BOT_TOKEN=your_telegram_bot_token_here

```

4. Initialize the database:

Ensure the `data` directory exists:

```bash

mkdir data

```

The bot will automatically create `scheduler.db` if it doesn't exist.

## Usage

Start the bot:

```bash

npm start

```

Interact with the bot via Telegram to build and manage your weekly schedule.

## License

MIT
