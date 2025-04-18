// Discord Crypto Bot - News & Price Tracker (CryptoPanic only version)
// Required packages:
// npm install discord.js node-fetch dotenv cron

require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const fetch = require('node-fetch');
const cron = require('cron');

// Create a new Discord client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// Configuration
const config = {
  // You'll set these values in Render's environment variables
  DISCORD_TOKEN: process.env.DISCORD_TOKEN,
  NEWS_CHANNEL_ID: process.env.NEWS_CHANNEL_ID,
  CRYPTOPANIC_API_KEY: process.env.CRYPTOPANIC_API_KEY,
  
  // Settings
  PRICE_UPDATE_INTERVAL: 5 * 60 * 1000, // 5 minutes
  NEWS_UPDATE_INTERVAL: '0 */2 * * *', // Every 2 hours
  NEWS_POSTS_PER_UPDATE: 3, // Number of news posts per update
  
  // Track posted news to avoid duplicates
  postedNewsIds: new Set(),
  MAX_STORED_NEWS_IDS: 100 // Limit memory usage
};

// Start the bot
client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}!`);
  
  // Initial actions
  updateBitcoinPrice();
  fetchAndPostNews();
  
  // Set up recurring tasks
  setInterval(updateBitcoinPrice, config.PRICE_UPDATE_INTERVAL);
  
  // Schedule news updates using cron
  const newsJob = new cron.CronJob(config.NEWS_UPDATE_INTERVAL, fetchAndPostNews);
  newsJob.start();
});

// Update Bitcoin price in the bot's status using CryptoPanic's currencies data
async function updateBitcoinPrice() {
  try {
    // CryptoPanic also provides price data through their currencies endpoint
    const apiUrl = 'https://cryptopanic.com/api/v1/currencies/';
    const params = new URLSearchParams({
      auth_token: config.CRYPTOPANIC_API_KEY,
      currencies: 'BTC'
    });
    
    const response = await fetch(`${apiUrl}?${params}`);
    const data = await response.json();
    
    if (data && data.results && data.results.length > 0) {
      const btcData = data.results[0];
      if (btcData.price_usd) {
        const price = new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: 'USD'
        }).format(btcData.price_usd);
        
        client.user.setActivity(`BTC: ${price}`, { type: 'WATCHING' });
        console.log(`Updated Bitcoin price: ${price}`);
      } else {
        console.error('Failed to get Bitcoin price from data:', btcData);
      }
    } else {
      console.error('Failed to get Bitcoin price data:', data);
    }
  } catch (error) {
    console.error('Error updating Bitcoin price:', error);
  }
}

// Fetch and post crypto news
async function fetchAndPostNews() {
  try {
    const newsChannel = client.channels.cache.get(config.NEWS_CHANNEL_ID);
    if (!newsChannel) {
      console.error('News channel not found! Check the channel ID.');
      return;
    }
    
    // Using CryptoPanic API for news
    const apiUrl = 'https://cryptopanic.com/api/v1/posts/';
    const params = new URLSearchParams({
      auth_token: config.CRYPTOPANIC_API_KEY,
      currencies: 'BTC',
      kind: 'news',
      filter: 'important'
    });
    
    const response = await fetch(`${apiUrl}?${params}`);
    const data = await response.json();
    
    if (!data || !data.results) {
      console.error('Failed to fetch news:', data);
      return;
    }
    
    let postedCount = 0;
    for (const newsItem of data.results) {
      // Skip if we've already posted this news item
      if (config.postedNewsIds.has(newsItem.id)) {
        continue;
      }
      
      // Create a rich embed for the news
      const embed = new EmbedBuilder()
        .setColor('#f7931a') // Bitcoin orange
        .setTitle(newsItem.title)
        .setURL(newsItem.url)
        .setDescription(`Source: ${newsItem.source.title}`)
        .setTimestamp(new Date(newsItem.published_at))
        .setFooter({ 
          text: `${newsItem.domain}`, 
          iconURL: 'https://bitcoin.org/img/icons/opengraph.png' 
        });
      
      // Add the news to the channel
      await newsChannel.send({ embeds: [embed] });
      
      // Add to our tracked news IDs
      config.postedNewsIds.add(newsItem.id);
      
      // Limit the size of our tracking set
      if (config.postedNewsIds.size > config.MAX_STORED_NEWS_IDS) {
        const iterator = config.postedNewsIds.values();
        config.postedNewsIds.delete(iterator.next().value);
      }
      
      postedCount++;
      
      // Stop if we've posted enough news items
      if (postedCount >= config.NEWS_POSTS_PER_UPDATE) {
        break;
      }
    }
    
    console.log(`Posted ${postedCount} news items.`);
  } catch (error) {
    console.error('Error fetching and posting news:', error);
  }
}

// Command handling
client.on('messageCreate', async message => {
  // Ignore bot messages
  if (message.author.bot) return;
  
  // Simple command system
  if (message.content.startsWith('!crypto')) {
    const command = message.content.slice(7).trim();
    
    if (command === 'help') {
      message.reply(
        '**Crypto Bot Commands**\n' +
        '• `!crypto help` - Show this help message\n' +
        '• `!crypto price` - Get the current Bitcoin price\n' +
        '• `!crypto news` - Get the latest crypto news'
      );
    } else if (command === 'price') {
      try {
        // Get price from CryptoPanic
        const apiUrl = 'https://cryptopanic.com/api/v1/currencies/';
        const params = new URLSearchParams({
          auth_token: config.CRYPTOPANIC_API_KEY,
          currencies: 'BTC'
        });
        
        const response = await fetch(`${apiUrl}?${params}`);
        const data = await response.json();
        
        if (data && data.results && data.results.length > 0) {
          const btcData = data.results[0];
          
          const embed = new EmbedBuilder()
            .setColor('#f7931a')
            .setTitle('Bitcoin Price')
            .addFields(
              { name: 'USD', value: `$${btcData.price_usd.toLocaleString()}`, inline: true },
              { name: '24h Change', value: `${btcData.percent_change_24h > 0 ? '▲' : '▼'} ${Math.abs(btcData.percent_change_24h).toFixed(2)}%`, inline: true },
              { name: 'Market Cap', value: `$${Math.round(btcData.market_cap_usd).toLocaleString()}`, inline: true }
            )
            .setTimestamp();
          
          message.reply({ embeds: [embed] });
        } else {
          message.reply('Sorry, I couldn\'t fetch the current Bitcoin price.');
        }
      } catch (error) {
        console.error('Error fetching price for command:', error);
        message.reply('Sorry, I couldn\'t fetch the current Bitcoin price.');
      }
    } else if (command === 'news') {
      message.reply(`Check out the latest crypto news in <#${config.NEWS_CHANNEL_ID}>!`);
    }
  }
});

// Error handling
client.on('error', error => {
  console.error('Discord client error:', error);
});

// Login to Discord
client.login(config.DISCORD_TOKEN);
