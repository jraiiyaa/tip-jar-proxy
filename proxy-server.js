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

// Fetch game passes for a universe (experience-specific passes)
async function fetchUniverseGamePasses(universeId) {
	return new Promise((resolve, reject) => {
		// NEW Roblox API endpoint (updated August 2025)
		const url = `https://apis.roblox.com/game-passes/v1/universes/${universeId}/game-passes?passView=Full&pageSize=100`;
		
		console.log('Calling Roblox Universe API:', url);

		https.get(url, (res) => {
			console.log('Response status:', res.statusCode);
			let data = '';

			res.on('data', (chunk) => {
				data += chunk;
			});

			res.on('end', () => {
				try {
					if (res.statusCode !== 200) {
						console.error('API returned error status:', res.statusCode);
						console.error('Response body:', data);
						reject(new Error(`API returned status ${res.statusCode}: ${data}`));
						return;
					}
					
					const jsonData = JSON.parse(data);
					resolve(jsonData);
				} catch (error) {
					console.error('Failed to parse JSON:', error);
					console.error('Raw response:', data);
					reject(error);
				}
			});
		}).on('error', (error) => {
			console.error('HTTP request error:', error);
			reject(error);
		});
	});
}

// Fetch games created by a user
async function fetchUserGames(userId) {
	return new Promise((resolve, reject) => {
		const url = `https://games.roblox.com/v2/users/${userId}/games?accessFilter=Public&limit=50&sortOrder=Asc`;
		
		console.log('Calling Roblox User Games API:', url);

		https.get(url, (res) => {
			console.log('User Games API Response status:', res.statusCode);
			let data = '';

			res.on('data', (chunk) => {
				data += chunk;
			});

			res.on('end', () => {
				try {
					if (res.statusCode !== 200) {
						console.error('User Games API returned error status:', res.statusCode);
						console.error('Response body:', data);
						reject(new Error(`API returned status ${res.statusCode}: ${data}`));
						return;
					}
					
					const jsonData = JSON.parse(data);
					resolve(jsonData);
				} catch (error) {
					console.error('Failed to parse JSON:', error);
					console.error('Raw response:', data);
					reject(error);
				}
			});
		}).on('error', (error) => {
			console.error('HTTP request error:', error);
			reject(error);
		});
	});
}

// Fetch all game passes from all games created by a user
async function fetchAllUserGamePasses(userId) {
	try {
		// Step 1: Get all games created by the user
		console.log('Fetching games created by user:', userId);
		const gamesResponse = await fetchUserGames(userId);
		
		const games = gamesResponse.data || [];
		console.log(`Found ${games.length} games created by user ${userId}`);
		
		if (games.length === 0) {
			return [];
		}
		
		// Step 2: Fetch passes from each game
		const allPasses = [];
		const universeIds = games.map(game => game.id || game.universeId).filter(id => id);
		
		console.log(`Fetching passes from ${universeIds.length} games...`);
		
		// Fetch passes from each game (limit to first 10 games to avoid timeout)
		const gamesToCheck = universeIds.slice(0, 10);
		for (const universeId of gamesToCheck) {
			try {
				console.log(`Fetching passes for game ${universeId}...`);
				const passesResponse = await fetchUniverseGamePasses(universeId);
				
				// Debug: Log the full response structure
				console.log(`Response for game ${universeId}:`, JSON.stringify(passesResponse, null, 2));
				console.log(`Response keys:`, Object.keys(passesResponse || {}));
				
				const passesArray = passesResponse.data || (Array.isArray(passesResponse) ? passesResponse : []);
				
				console.log(`Passes array type:`, typeof passesArray, `Is array:`, Array.isArray(passesArray), `Length:`, passesArray.length);
				
				if (Array.isArray(passesArray) && passesArray.length > 0) {
					for (const pass of passesArray) {
						allPasses.push({
							id: pass.id || pass.gamePassId || pass.assetId || pass.passId,
							name: pass.name || pass.displayName || 'Unknown',
							icon: pass.iconImageUrl || pass.icon || pass.imageUrl || '',
							description: pass.description || ''
						});
					}
					console.log(`Found ${passesArray.length} passes in game ${universeId}`);
				} else {
					console.log(`No passes found in game ${universeId} (array empty or not an array)`);
				}
			} catch (error) {
				console.error(`Error fetching passes for game ${universeId}:`, error.message);
				// Continue with next game
			}
		}
		
		console.log(`Total passes found across all games: ${allPasses.length}`);
		return allPasses;
		
	} catch (error) {
		console.error('Error fetching user game passes:', error);
		return [];
	}
}

// Fetch game passes created by a user (legacy - for universal passes)
async function fetchGamePasses(userId, cursor = '') {
	return new Promise((resolve, reject) => {
		let url = `https://catalog.roblox.com/v1/search/items?category=GamePass&creatorTargetId=${userId}&creatorType=User&limit=100&sortOrder=Desc`;
		if (cursor) {
			url += `&cursor=${cursor}`;
		}

		console.log('Calling Roblox Catalog API:', url);

		https.get(url, (res) => {
			console.log('Response status:', res.statusCode);
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

// API endpoint: GET /api/gamepasses?universeId=123456789 OR ?userId=123456789
app.get('/api/gamepasses', async (req, res) => {
	try {
		const universeId = req.query.universeId;
		const userId = req.query.userId;

		// Prioritize universeId (experience-specific passes)
		if (universeId) {
			console.log('Fetching game passes for universe:', universeId);
			try {
				const response = await fetchUniverseGamePasses(universeId);
				
				console.log('Universe API Response:', JSON.stringify(response, null, 2));
				console.log('Response keys:', Object.keys(response || {}));

				// The new API returns data in "data" array, or directly as array
				const gamePassesArray = response.data || (Array.isArray(response) ? response : []);
				
				if (Array.isArray(gamePassesArray) && gamePassesArray.length > 0) {
					const allGamePasses = [];
					for (const item of gamePassesArray) {
						allGamePasses.push({
							id: item.id || item.gamePassId || item.assetId || item.passId,
							name: item.name || item.displayName || 'Unknown',
							icon: item.iconImageUrl || item.icon || item.imageUrl || '',
							description: item.description || ''
						});
					}
					
					console.log(`Total universe game passes found: ${allGamePasses.length}`);
					
					return res.json({
						success: true,
						gamePasses: allGamePasses,
						count: allGamePasses.length
					});
				} else {
					console.log('No game passes in response or empty array');
					console.log('Response type:', typeof gamePassesArray);
					console.log('Is array:', Array.isArray(gamePassesArray));
					return res.json({
						success: true,
						gamePasses: [],
						count: 0
					});
				}
			} catch (error) {
				console.error('Error fetching universe game passes:', error);
				return res.status(500).json({
					success: false,
					error: error.message
				});
			}
		}
		
		// Fallback to userId - fetch passes from all games created by user
		if (!userId) {
			return res.status(400).json({
				success: false,
				error: 'universeId or userId parameter is required'
			});
		}

		console.log('Fetching game passes from all games created by user:', userId);
		
		// Fetch passes from all games the user created
		const allGamePasses = await fetchAllUserGamePasses(userId);
		
		console.log(`Total game passes found across all user's games: ${allGamePasses.length}`);

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

