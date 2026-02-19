process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const express = require('express');
const axios = require('axios');
const { wrapper } = require('axios-cookiejar-support');
const { CookieJar } = require('tough-cookie');

const app = express();
const PORT = process.env.PORT || 5000;

// Daftar Mirror MovieBox (Jika satu 403, pindah ke yang lain)
const MIRRORS = [
    "https://www.moviebox.ph",
    "https://moviebox.pk",
    "https://h5.aoneroom.com",
    "https://api.moviebox.ph"
];

let currentMirrorIndex = 0;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, Range');
    res.header('Access-Control-Expose-Headers', 'Content-Length, Content-Range');
    if (req.method === 'OPTIONS') {
        res.sendStatus(200);
    } else {
        next();
    }
});

// Header yang lebih "Jujur" agar tidak dianggap bot berbahaya
const getBaseHeaders = () => {
    return {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Connection': 'keep-alive',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-origin',
        'Origin': MIRRORS[currentMirrorIndex],
        'Referer': `${MIRRORS[currentMirrorIndex]}/`
    };
};

const jar = new CookieJar();
const client = wrapper(axios.create({
    jar,
    withCredentials: true,
    timeout: 15000
}));

// Fungsi Pintar: Coba request, jika 403 ganti mirror otomatis
async function fetchSmart(path, options = {}) {
    let attempt = 0;
    const maxAttempts = MIRRORS.length;

    while (attempt < maxAttempts) {
        const baseUrl = MIRRORS[currentMirrorIndex];
        const url = `${baseUrl}/wefeed-h5-bff${path}`;
        
        try {
            const config = {
                ...options,
                headers: {
                    ...getBaseHeaders(),
                    ...(options.headers || {})
                }
            };
            
            const { data } = await client(url, config);
            return data.data || data;

        } catch (error) {
            // Hanya ganti mirror jika errornya 403 (Forbidden) atau Network Error
            if (!error.response || error.response.status === 403 || error.response.status >= 500) {
                console.log(`Mirror ${baseUrl} failed (${error.response?.status || 'Net'}). Switching...`);
                currentMirrorIndex = (currentMirrorIndex + 1) % MIRRORS.length;
                attempt++;
            } else {
                // Jika error 404 atau 400, berarti memang datanya tidak ada (jangan retry)
                throw error;
            }
        }
    }
    throw new Error("All mirrors failed. Service is currently unavailable.");
}

// Init Session (Pancingan awal)
async function initSession() {
    try {
        await fetchSmart('/app/get-latest-app-pkgs?app_name=moviebox');
    } catch (e) {
        // Ignore init errors
    }
}

// --- ENDPOINTS ---

app.get('/api/homepage', async (req, res) => {
    try {
        await initSession();
        const data = await fetchSmart('/web/home');
        res.json({ status: 'success', data });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
});

app.get('/api/trending', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 0;
        const perPage = parseInt(req.query.perPage) || 18;
        const data = await fetchSmart('/web/subject/trending', {
            params: { page, perPage, uid: '5591179548772780352' }
        });
        res.json({ status: 'success', data });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
});

app.get('/api/search/:query', async (req, res) => {
    try {
        const { query } = req.params;
        const page = parseInt(req.query.page) || 1;
        const perPage = parseInt(req.query.perPage) || 24;
        const subjectType = parseInt(req.query.type) || 0;

        const data = await fetchSmart('/web/subject/search', {
            method: 'POST',
            data: { keyword: query, page, perPage, subjectType }
        });

        if (data.items) {
            data.items = data.items.map(item => ({
                ...item,
                thumbnail: item.cover?.url || item.stills?.url || ''
            }));
        }

        res.json({ status: 'success', data });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
});

app.get('/api/info/:movieId', async (req, res) => {
    try {
        const { movieId } = req.params;
        const data = await fetchSmart('/web/subject/detail', {
            params: { subjectId: movieId }
        });

        if (data.subject) {
            data.subject.thumbnail = data.subject.cover?.url || data.subject.stills?.url || '';
        }

        res.json({ status: 'success', data });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
});

app.get('/api/sources/:movieId', async (req, res) => {
    try {
        const { movieId } = req.params;
        const season = parseInt(req.query.season) || 0;
        const episode = parseInt(req.query.episode) || 0;
        
        const protocol = req.headers['x-forwarded-proto'] || req.protocol;
        const host = req.headers['host'];

        // 1. Get Info for Path
        const info = await fetchSmart('/web/subject/detail', {
            params: { subjectId: movieId }
        });

        const detailPath = info?.subject?.detailPath || '';
        
        // 2. Get Downloads (Bypass Referer check using fmovies host)
        const data = await fetchSmart('/web/subject/download', {
            params: { subjectId: movieId, se: season, ep: episode },
            headers: {
                'Referer': `https://fmoviesunblocked.net/spa/videoPlayPage/movies/${detailPath}?id=${movieId}&type=/movie/detail`,
                'Origin': 'https://fmoviesunblocked.net'
            }
        });

        // 3. Process Links
        const processedSources = (data.downloads || []).map(file => ({
            id: file.id,
            quality: parseInt(file.resolution) || 0,
            size: file.size,
            format: 'mp4',
            proxyUrl: `${protocol}://${host}/api/download/${encodeURIComponent(file.url)}`
        }));

        res.json({
            status: 'success',
            data: { ...data, processedSources }
        });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
});

app.get('/api/download/*', async (req, res) => {
    try {
        const rawUrl = req.params[0];
        if (!rawUrl) return res.status(400).json({ status: 'error', message: 'Missing URL' });

        const downloadUrl = decodeURIComponent(rawUrl);
        const range = req.headers.range;

        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Referer': 'https://fmoviesunblocked.net/',
            'Origin': 'https://fmoviesunblocked.net',
            'Accept': '*/*'
        };

        if (range) headers['Range'] = range;

        const response = await axios({
            method: 'GET',
            url: downloadUrl,
            responseType: 'stream',
            headers,
            timeout: 60000,
            validateStatus: status => status >= 200 && status < 300
        });

        const head = {
            'Content-Type': response.headers['content-type'] || 'video/mp4',
            'Content-Length': response.headers['content-length'],
            'Accept-Ranges': 'bytes',
        };

        if (response.status === 206) {
            head['Content-Range'] = response.headers['content-range'];
            res.writeHead(206, head);
        } else {
            res.writeHead(200, head);
        }

        response.data.pipe(res);

        response.data.on('error', () => res.end());
        res.on('close', () => {
            if (response.data && typeof response.data.destroy === 'function') {
                response.data.destroy();
            }
        });

    } catch (error) {
        if (!res.headersSent) {
            res.status(500).json({ status: 'error', message: 'Stream failed' });
        }
    }
});

app.use((req, res) => {
    res.status(404).json({ status: 'error', message: 'Endpoint not found' });
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

module.exports = app;
