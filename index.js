import express from 'express';
import axios from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import { CookieJar } from 'tough-cookie';

const app = express();
const PORT = process.env.PORT || 8080; // Railway default port

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS middleware
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, Range');
    res.header('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Content-Type');
    if (req.method === 'OPTIONS') {
        res.sendStatus(200);
    } else {
        next();
    }
});

const SELECTED_HOST = process.env.MOVIEBOX_API_HOST || "h5.aoneroom.com";
const HOST_URL = `https://${SELECTED_HOST}`;

// Fungsi generate IP Random agar tidak terdeteksi spam dari satu IP
function getRandomIP() {
    return Array(4).fill(0).map((_, i) => Math.floor(Math.random() * 255) + (i === 0 ? 1 : 0)).join('.');
}

// Header Browser Modern (Chrome Mobile) agar tidak dianggap bot
const getHeaders = () => {
    const randomIP = getRandomIP();
    return {
        'Host': SELECTED_HOST,
        'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': `${HOST_URL}/`,
        'Origin': HOST_URL,
        'X-Requested-With': 'com.android.chrome',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-origin',
        // IP Spoofing Headers
        'X-Forwarded-For': randomIP,
        'X-Real-IP': randomIP,
        'Client-IP': randomIP
    };
};

const SubjectType = { ALL: 0, MOVIES: 1, TV_SERIES: 2, MUSIC: 6 };

const jar = new CookieJar();
const axiosInstance = wrapper(axios.create({
    jar,
    withCredentials: true,
    timeout: 30000
}));

let cookiesInitialized = false;

function processApiResponse(response) {
    if (response.data && response.data.data) return response.data.data;
    return response.data || response;
}

// Inisialisasi Cookie (Wajib untuk bypass 403)
async function ensureCookiesAreAssigned() {
    if (!cookiesInitialized) {
        try {
            console.log('Initializing session cookies...');
            // Hit halaman utama dulu untuk dapat cookie session
            await axiosInstance.get(`${HOST_URL}/`, {
                headers: getHeaders()
            });
            
            // Lalu hit endpoint app config
            await axiosInstance.get(`${HOST_URL}/wefeed-h5-bff/app/get-latest-app-pkgs?app_name=moviebox`, {
                headers: getHeaders()
            });
            
            cookiesInitialized = true;
            console.log('Session cookies initialized successfully');
        } catch (error) {
            console.error('Failed to init cookies:', error.message);
            // Jangan throw error, coba lanjut siapa tau request berikutnya berhasil
        }
    }
    return cookiesInitialized;
}

// Wrapper Request
async function makeApiRequestWithCookies(url, options = {}) {
    await ensureCookiesAreAssigned();
    
    // Merge headers dynamic
    const headers = { ...getHeaders(), ...options.headers };
    
    const config = {
        url: url,
        headers: headers,
        withCredentials: true,
        ...options
    };
    
    try {
        return await axiosInstance(config);
    } catch (error) {
        // Jika 403, coba reset cookie dan retry sekali
        if (error.response?.status === 403 && cookiesInitialized) {
            console.log("403 Detected. Retrying with fresh cookies...");
            cookiesInitialized = false;
            jar.removeAllCookiesSync();
            await ensureCookiesAreAssigned();
            return await axiosInstance(config);
        }
        console.error(`Request to ${url} failed:`, error.response?.status);
        throw error;
    }
}

// --- ROUTES ---

app.get('/', (req, res) => res.send('<h1>MovieBox API Server Running</h1><p>Status: Operational with Anti-403</p>'));

// Homepage
app.get('/api/homepage', async (req, res) => {
    try {
        const response = await makeApiRequestWithCookies(`${HOST_URL}/wefeed-h5-bff/web/home`);
        res.json({ status: 'success', data: processApiResponse(response) });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
});

// Trending
app.get('/api/trending', async (req, res) => {
    try {
        const params = { page: req.query.page || 0, perPage: req.query.perPage || 18, uid: '5591179548772780352' };
        const response = await makeApiRequestWithCookies(`${HOST_URL}/wefeed-h5-bff/web/subject/trending`, { method: 'GET', params });
        res.json({ status: 'success', data: processApiResponse(response) });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
});

// Search
app.get('/api/search/:query', async (req, res) => {
    try {
        const payload = {
            keyword: req.params.query,
            page: parseInt(req.query.page) || 1,
            perPage: parseInt(req.query.perPage) || 24,
            subjectType: parseInt(req.query.type) || SubjectType.ALL
        };
        const response = await makeApiRequestWithCookies(`${HOST_URL}/wefeed-h5-bff/web/subject/search`, { method: 'POST', data: payload });
        let content = processApiResponse(response);
        if (content.items) {
            content.items.forEach(item => {
                if (item.cover?.url) item.thumbnail = item.cover.url;
                else if (item.stills?.url) item.thumbnail = item.stills.url;
            });
        }
        res.json({ status: 'success', data: content });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
});

// Detail Info
app.get('/api/info/:movieId', async (req, res) => {
    try {
        const response = await makeApiRequestWithCookies(`${HOST_URL}/wefeed-h5-bff/web/subject/detail`, {
            method: 'GET', params: { subjectId: req.params.movieId }
        });
        const content = processApiResponse(response);
        if (content.subject) {
            if (content.subject.cover?.url) content.subject.thumbnail = content.subject.cover.url;
        }
        res.json({ status: 'success', data: content });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
});

// Get Sources (FIXED 403 Logic)
app.get('/api/sources/:movieId', async (req, res) => {
    try {
        const { movieId } = req.params;
        const season = parseInt(req.query.season) || 1;
        const episode = parseInt(req.query.episode) || 1;

        console.log(`Getting sources for: ${movieId} S${season}E${episode}`);

        // 1. Get Detail untuk mendapatkan PATH yang benar untuk Referer
        const infoRes = await makeApiRequestWithCookies(`${HOST_URL}/wefeed-h5-bff/web/subject/detail`, {
            method: 'GET', params: { subjectId: movieId }
        });
        
        const movieInfo = processApiResponse(infoRes);
        const detailPath = movieInfo?.subject?.detailPath;

        // Construct Referer yang VALID (seolah-olah kita user yang buka webnya)
        // Format referer web asli: https://h5.aoneroom.com/detail/[detailPath]
        let validReferer = `${HOST_URL}/`;
        if (detailPath) {
            validReferer = `${HOST_URL}/detail/${detailPath}`;
        }
        
        console.log(`Using Referer: ${validReferer}`);

        // 2. Request Download Link
        const response = await makeApiRequestWithCookies(`${HOST_URL}/wefeed-h5-bff/web/subject/download`, {
            method: 'GET',
            params: { subjectId: movieId, se: season, ep: episode },
            headers: {
                'Referer': validReferer, // PENTING: Referer harus dari domain mereka sendiri
                'Origin': HOST_URL
            }
        });

        const content = processApiResponse(response);

        if (content && content.downloads) {
            const processedSources = content.downloads.map(file => ({
                id: file.id,
                resolution: parseInt(file.resolution) || 0,
                url: file.url,
                // Gunakan URL Query Param agar tidak error regex di backend
                proxyUrl: `${req.protocol}://${req.get('host')}/api/download?url=${encodeURIComponent(file.url)}`,
                size: file.size
            }));
            content.processedSources = processedSources;
        }

        res.json({ status: 'success', data: content });
    } catch (error) {
        console.error("Source Error:", error.message);
        // Kirim status 200 dengan data kosong agar app tidak crash, tapi tau kalau kosong
        res.json({ status: 'error', message: error.message, data: { downloads: [] } }); 
    }
});

// Proxy Download (FIXED Range & Headers)
app.get('/api/download', async (req, res) => {
    try {
        const targetUrl = req.query.url;

        if (!targetUrl) {
            return res.status(400).send("Missing 'url' parameter");
        }

        // Whitelist domains (Perluas agar tidak 400 Bad Request)
        const validDomains = [
            'hakunaymatata.com', 
            'aoneroom.com',
            'googlevideo.com',
            'fbcdn.net'
        ];
        
        const urlObj = new URL(targetUrl);
        // Cek apakah hostname mengandung salah satu domain di whitelist
        if (!validDomains.some(domain => urlObj.hostname.includes(domain))) {
            console.log(`Blocked domain: ${urlObj.hostname}`);
            // return res.status(403).send("Forbidden Domain"); // Optional: Disable strict check sementara
        }

        console.log(`Proxying: ${targetUrl}`);

        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Referer': 'https://h5.aoneroom.com/',
            'Origin': 'https://h5.aoneroom.com',
            'Accept': '*/*',
            'Accept-Encoding': 'identity',
            'Connection': 'keep-alive'
        };

        if (req.headers.range) {
            headers['Range'] = req.headers.range;
        }

        const response = await axios({
            method: 'GET',
            url: targetUrl,
            responseType: 'stream',
            headers: headers,
            validateStatus: (status) => status < 400,
            timeout: 60000 // Timeout lebih lama untuk video
        });

        // Forward headers penting ke client
        res.status(response.status);
        
        const forwardHeaders = [
            'content-type', 
            'content-length', 
            'content-range', 
            'accept-ranges', 
            'cache-control'
        ];
        
        forwardHeaders.forEach(h => {
            if (response.headers[h]) res.set(h, response.headers[h]);
        });
        
        // Paksa type video jika tidak terdeteksi
        if (!response.headers['content-type']) {
            res.set('Content-Type', 'video/mp4');
        }

        response.data.pipe(res);

        // Handle putus koneksi
        req.on('close', () => {
            if (response.data) response.data.destroy();
        });

    } catch (error) {
        console.error("Proxy Stream Error:", error.message);
        if (!res.headersSent) res.status(500).send("Stream Error");
    }
});

// Listener untuk Railway
app.listen(PORT, '0.0.0.0', () => {
    console.log(`MovieBox API running on port ${PORT}`);
});

export default app;
