// Tip Jar Proxy Server
// Host this on Replit, Glitch, Railway, or any Node.js hosting service
// This proxy fetches game passes from Roblox API and returns them to your Roblox game

const express = require('express');
const https = require('https');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS for Roblox
app.use(cors());
app.use(express.json());

// Fetch game passes created by a user
async function fetchGamePasses(userId, cursor = '') {
	return new Promise((resolve, reject) => {
		let url = `https://catalog.roblox.com/v1/search/items?category=GamePass&creatorTargetId=${userId}&creatorType=User&limit=100&sortOrder=Desc`;
		if (cursor) {
			url += `&cursor=${cursor}`;
		}

		https.get(url, (res) => {
			let data = '';

			res.on('data', (chunk) => {
				data += chunk;
			});

			res.on('end', () => {
				try {
					const jsonData = JSON.parse(data);
					resolve(jsonData);
				} catch (error) {
					reject(error);
				}
			});
		}).on('error', (error) => {
			reject(error);
		});
	});
}

// API endpoint: GET /api/gamepasses?userId=123456789
app.get('/api/gamepasses', async (req, res) => {
	try {
		const userId = req.query.userId;

		if (!userId) {
			return res.status(400).json({
				success: false,
				error: 'userId parameter is required'
			});
		}

		const allGamePasses = [];
		let nextPageCursor = '';

		// Fetch all pages
		do {
			const response = await fetchGamePasses(userId, nextPageCursor);

			if (response && response.data) {
				for (const item of response.data) {
					const gamePassId = item.id || item.assetId;
					
					allGamePasses.push({
						id: gamePassId,
						name: item.name || 'Unknown',
						icon: item.iconImageUrl || '',
						description: item.description || ''
					});
				}

				nextPageCursor = response.nextPageCursor || '';
			} else {
				break;
			}
		} while (nextPageCursor);

		res.json({
			success: true,
			gamePasses: allGamePasses,
			count: allGamePasses.length
		});

	} catch (error) {
		console.error('Error fetching game passes:', error);
		res.status(500).json({
			success: false,
			error: error.message
		});
	}
});

// Health check endpoint
app.get('/', (req, res) => {
	res.json({
		status: 'online',
		message: 'Tip Jar Proxy Server is running!'
	});
});

app.listen(PORT, () => {
	console.log(`✅ Tip Jar Proxy Server running on port ${PORT}`);
	console.log(`📡 API endpoint: http://localhost:${PORT}/api/gamepasses?userId=YOUR_USER_ID`);
});

