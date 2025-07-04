on:
  schedule:
    - cron: '*/5 * * * *' # Every 5 minutes
  workflow_dispatch:      # Allow manual trigger

jobs:
  twitch-cron-sync:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout repo
        uses: actions/checkout@v4

      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install node-fetch
        run: npm install node-fetch@2

      - name: Sync cron-job.org job with Twitch live status
        env:
          TWITCH_CLIENT_ID: ${{ secrets.TWITCH_CLIENT_ID }}
          TWITCH_CLIENT_SECRET: ${{ secrets.TWITCH_CLIENT_SECRET }}
          TWITCH_USER_ID: ${{ secrets.TWITCH_USER_ID }}
          CRON_JOB_ORG_API_KEY: ${{ secrets.CRON_JOB_ORG_API_KEY }}
          CRON_JOB_ORG_JOB_ID: ${{ secrets.CRON_JOB_ORG_JOB_ID }}
        run: node .github/scripts/twitch-cronjob-sync.js
