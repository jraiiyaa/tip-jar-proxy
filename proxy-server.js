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

// Cache for game passes (userId -> { passes, timestamp })
const passCache = {};
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Get cached passes or return null if expired
function getCachedPasses(userId) {
	const cached = passCache[userId];
	if (cached && (Date.now() - cached.timestamp) < CACHE_DURATION) {
		console.log(`Using cached passes for user ${userId}`);
		return cached.passes;
	}
	return null;
}

// Store passes in cache
function cachePasses(userId, passes) {
	passCache[userId] = {
		passes: passes,
		timestamp: Date.now()
	};
	console.log(`Cached ${passes.length} passes for user ${userId}`);
}

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
		// Check cache first
		const cached = getCachedPasses(userId);
		if (cached) {
			return cached;
		}
		
		// Step 1: Get all games created by the user
		console.log('Fetching games created by user:', userId);
		const gamesResponse = await fetchUserGames(userId);
		
		const games = gamesResponse.data || [];
		console.log(`Found ${games.length} games created by user ${userId}`);
		
		if (games.length === 0) {
			return [];
		}
		
		// Step 2: Fetch passes from each game IN PARALLEL (much faster!)
		const universeIds = games.map(game => game.id || game.universeId).filter(id => id);
		const gamesToCheck = universeIds.slice(0, 10); // Limit to first 10 games
		
		console.log(`Fetching passes from ${gamesToCheck.length} games in parallel...`);
		
		// Fetch all games in parallel using Promise.all
		const passPromises = gamesToCheck.map(async (universeId) => {
			try {
				const passesResponse = await fetchUniverseGamePasses(universeId);
				const passesArray = passesResponse.gamePasses || passesResponse.data || (Array.isArray(passesResponse) ? passesResponse : []);
				
				if (Array.isArray(passesArray) && passesArray.length > 0) {
					const formattedPasses = passesArray.map(pass => {
						const iconAssetId = pass.displayIconImageAssetId || pass.iconImageAssetId;
						const iconUrl = iconAssetId ? `rbxassetid://${iconAssetId}` : '';
						
						return {
							id: pass.id || pass.productId || pass.gamePassId || pass.assetId || pass.passId,
							name: pass.displayName || pass.name || 'Unknown',
							icon: iconUrl || pass.iconImageUrl || pass.icon || pass.imageUrl || '',
							description: pass.displayDescription || pass.description || ''
						};
					});
					
					console.log(`Found ${passesArray.length} passes in game ${universeId}`);
					return formattedPasses;
				}
				return [];
			} catch (error) {
				console.error(`Error fetching passes for game ${universeId}:`, error.message);
				return [];
			}
		});
		
		// Wait for all promises to complete
		const allResults = await Promise.all(passPromises);
		
		// Flatten all passes into one array
		const allPasses = allResults.flat();
		
		console.log(`Total passes found across all games: ${allPasses.length}`);
		
		// Cache the results
		cachePasses(userId, allPasses);
		
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

				// The API returns { gamePasses: [...], nextPageToken: "" }
				const gamePassesArray = response.gamePasses || response.data || (Array.isArray(response) ? response : []);
				
				if (Array.isArray(gamePassesArray) && gamePassesArray.length > 0) {
					const allGamePasses = [];
					for (const item of gamePassesArray) {
						// The API returns: id, name/displayName, displayIconImageAssetId, displayDescription
						const iconAssetId = item.displayIconImageAssetId || item.iconImageAssetId;
						const iconUrl = iconAssetId ? `rbxassetid://${iconAssetId}` : '';
						
						allGamePasses.push({
							id: item.id || item.productId || item.gamePassId || item.assetId || item.passId,
							name: item.displayName || item.name || 'Unknown',
							icon: iconUrl || item.iconImageUrl || item.icon || item.imageUrl || '',
							description: item.displayDescription || item.description || ''
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

