const express = require('express');
const axios = require('axios');
const { wrapper } = require('axios-cookiejar-support');
const { CookieJar } = require('tough-cookie');

const app = express();
const PORT = process.env.PORT || 5000;

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

const HOST_URL = "https://h5.aoneroom.com";

const DEFAULT_HEADERS = {
    'X-Client-Info': '{"timezone":"Africa/Nairobi"}',
    'Accept-Language': 'en-US,en;q=0.5',
    'Accept': 'application/json',
    'User-Agent': 'okhttp/4.12.0',
    'Referer': HOST_URL,
    'Connection': 'keep-alive'
};

const jar = new CookieJar();
const client = wrapper(axios.create({
    jar,
    withCredentials: true,
    timeout: 30000,
    headers: DEFAULT_HEADERS
}));

let isSessionInit = false;

async function initSession() {
    if (isSessionInit) return;
    try {
        await client.get(`${HOST_URL}/wefeed-h5-bff/app/get-latest-app-pkgs?app_name=moviebox`);
        isSessionInit = true;
    } catch (error) {
        console.error('Session init failed:', error.message);
    }
}

async function fetchAPI(url, options = {}) {
    await initSession();
    try {
        const { data } = await client(url, options);
        return data.data || data;
    } catch (error) {
        throw error;
    }
}

app.get('/api/homepage', async (req, res) => {
    try {
        const data = await fetchAPI(`${HOST_URL}/wefeed-h5-bff/web/home`);
        res.json({ status: 'success', data });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
});

app.get('/api/trending', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 0;
        const perPage = parseInt(req.query.perPage) || 18;
        const data = await fetchAPI(`${HOST_URL}/wefeed-h5-bff/web/subject/trending`, {
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

        const data = await fetchAPI(`${HOST_URL}/wefeed-h5-bff/web/subject/search`, {
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
        const data = await fetchAPI(`${HOST_URL}/wefeed-h5-bff/web/subject/detail`, {
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
        const protocol = req.protocol;
        const host = req.get('host');

        const info = await fetchAPI(`${HOST_URL}/wefeed-h5-bff/web/subject/detail`, {
            params: { subjectId: movieId }
        });

        const detailPath = info?.subject?.detailPath || '';
        const refererUrl = `https://fmoviesunblocked.net/spa/videoPlayPage/movies/${detailPath}?id=${movieId}&type=/movie/detail`;

        const data = await fetchAPI(`${HOST_URL}/wefeed-h5-bff/web/subject/download`, {
            params: { subjectId: movieId, se: season, ep: episode },
            headers: {
                'Referer': refererUrl,
                'Origin': 'https://fmoviesunblocked.net'
            }
        });

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
            'User-Agent': 'okhttp/4.12.0',
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
        res.on('close', () => response.data.destroy());

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
