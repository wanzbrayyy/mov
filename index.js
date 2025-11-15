const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const { wrapper } = require('axios-cookiejar-support');
const { CookieJar } = require('tough-cookie');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS middleware
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, Range');
    if (req.method === 'OPTIONS') {
        res.sendStatus(200);
    } else {
        next();
    }
});

// MovieBox API configuration
const MIRROR_HOSTS = [
    "h5.aoneroom.com",
    "movieboxapp.in", 
    "moviebox.pk",
    "moviebox.ph",
    "moviebox.id",
    "v.moviebox.ph",
    "netnaija.video"
];

// Use different hosts for different endpoints - some mirrors work better for downloads
const SELECTED_HOST = process.env.MOVIEBOX_API_HOST || "h5.aoneroom.com";
const HOST_URL = `https://${SELECTED_HOST}`;

// Alternative hosts for download endpoint
const DOWNLOAD_MIRRORS = [
    "moviebox.pk",
    "moviebox.ph", 
    "moviebox.id",
    "v.moviebox.ph",
    "h5.aoneroom.com"
];

// Updated headers based on mobile app traffic analysis from PCAP + region bypass
const DEFAULT_HEADERS = {
    'X-Client-Info': '{"timezone":"Africa/Nairobi"}',
    'Accept-Language': 'en-US,en;q=0.5',
    'Accept': 'application/json',
    'User-Agent': 'okhttp/4.12.0', // Mobile app user agent from PCAP
    'Referer': HOST_URL,
    'Host': SELECTED_HOST,
    'Connection': 'keep-alive',
    // Add IP spoofing headers to bypass region restrictions
    'X-Forwarded-For': '1.1.1.1',
    'CF-Connecting-IP': '1.1.1.1',
    'X-Real-IP': '1.1.1.1'
};

// Subject types
const SubjectType = {
    ALL: 0,
    MOVIES: 1,
    TV_SERIES: 2,
    MUSIC: 6
};

// Session management - using axios cookie jar for proper session handling
const jar = new CookieJar();
const axiosInstance = wrapper(axios.create({
    jar,
    withCredentials: true,
    timeout: 30000
}));

let movieboxAppInfo = null;
let cookiesInitialized = false;

// Helper functions
function processApiResponse(response) {
    if (response.data && response.data.data) {
        return response.data.data;
    }
    return response.data || response;
}

async function ensureCookiesAreAssigned() {
    if (!cookiesInitialized) {
        try {
            console.log('Initializing session cookies...');
            const response = await axiosInstance.get(`${HOST_URL}/wefeed-h5-bff/app/get-latest-app-pkgs?app_name=moviebox`, {
                headers: DEFAULT_HEADERS
            });
            
            movieboxAppInfo = processApiResponse(response);
            cookiesInitialized = true;
            console.log('Session cookies initialized successfully');
            
            // Log available cookies for debugging
            if (response.headers['set-cookie']) {
                console.log('Received cookies:', response.headers['set-cookie']);
            }
            
        } catch (error) {
            console.error('Failed to get app info:', error.message);
            throw error;
        }
    }
    return cookiesInitialized;
}

async function makeApiRequest(url, options = {}) {
    await ensureCookiesAreAssigned();
    
    const config = {
        url: url,
        headers: { ...DEFAULT_HEADERS, ...options.headers },
        withCredentials: true,
        ...options
    };
    
    try {
        const response = await axiosInstance(config);
        return response;
    } catch (error) {
        console.error(`Request to ${url} failed:`, error.response?.status, error.response?.statusText);
        throw error;
    }
}

async function makeApiRequestWithCookies(url, options = {}) {
    await ensureCookiesAreAssigned();
    
    const config = {
        url: url,
        headers: { ...DEFAULT_HEADERS, ...options.headers },
        withCredentials: true,
        ...options
    };
    
    try {
        const response = await axiosInstance(config);
        return response;
    } catch (error) {
        console.error(`Request with cookies to ${url} failed:`, error.response?.status, error.response?.statusText);
        throw error;
    }
}

// API Routes

// Health check
app.get('/', (req, res) => {
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <link rel="icon" type="image/x-icon" href="https://i.ibb.co/27ymgy5Z/abmoviev1.jpg" />
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta property="og:locale" content="en_US" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="Movie API - BY AB-ZTECH" />
    <meta name="keywords" content="Movie, API, Movies, TV Series, Streaming" />
    <meta itemprop="image" content="https://i.ibb.co/27ymgy5Z/abmoviev1.jpg" />
    <meta property="og:image" content="https://i.ibb.co/27ymgy5Z/abmoviev1.jpg" />
    <meta property="og:image:secure_url" content="https://i.ibb.co/27ymgy5Z/abmoviev1.jpg" />
    <meta property="og:image:width" content="650" />
    <meta property="og:image:height" content="350" />
    <title>ABZTECH MovieAPI Documentation</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css"> 
    <style>
        :root {
            --primary: #2196f3;
            --secondary: #2729b0;
            --accent: #e74c3c;
            --background: linear-gradient(45deg, #000428, #004e92);
            --glass: rgba(255, 255, 255, 0.1);
            --success: #2ecc71;
        }

        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
            font-family: 'Segoe UI', sans-serif;
            transition: all 0.2s ease;
        }

        body {
            background: var(--background);
            color: white;
            min-height: 100vh;
            line-height: 1.6;
        }

        .container {
            max-width: 1200px;
            margin: 0 auto;
            padding: 2rem 1rem;
        }

        .header {
            text-align: center;
            margin-bottom: 3rem;
        }

        .title {
            font-size: 2.5rem;
            margin-bottom: 1rem;
            background: linear-gradient(45deg, #fff, #2196f3);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            font-weight: 700;
            text-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }

        .tagline {
            font-size: 1.2rem;
            opacity: 0.9;
            max-width: 600px;
            margin: 0 auto 2rem;
            color: rgba(255, 255, 255, 0.8);
        }

        .features-grid {
            display: grid;
            gap: 1.5rem;
            grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
            margin-bottom: 3rem;
        }

        .feature-card {
            background: var(--glass);
            border-radius: 1rem;
            padding: 1.5rem;
            backdrop-filter: blur(10px);
            transition: transform 0.3s;
            border: 1px solid rgba(255, 255, 255, 0.2);
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
            text-align: center;
        }

        .feature-card:hover {
            transform: translateY(-5px) scale(1.02);
            box-shadow: 0 12px 40px rgba(0,0,0,0.2);
        }

        .feature-icon {
            font-size: 2.5rem;
            color: var(--primary);
            margin-bottom: 1rem;
        }

        .feature-title {
            font-size: 1.2rem;
            margin-bottom: 0.75rem;
            font-weight: 600;
        }

        .feature-desc {
            color: rgba(255, 255, 255, 0.8);
            font-size: 0.95rem;
        }

        .endpoint-card {
            background: var(--glass);
            border-radius: 1rem;
            overflow: hidden;
            backdrop-filter: blur(10px);
            transition: transform 0.3s;
            border: 1px solid rgba(255, 255, 255, 0.2);
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
            margin-bottom: 2rem;
        }

        .endpoint-card:hover {
            transform: translateY(-5px);
            box-shadow: 0 12px 40px rgba(0,0,0,0.2);
        }

        .endpoint-header {
            padding: 1.5rem;
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
            display: flex;
            align-items: center;
            gap: 1rem;
        }

        .endpoint-icon {
            width: 50px;
            height: 50px;
            background: linear-gradient(45deg, var(--primary), var(--secondary));
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 1.5rem;
        }

        .endpoint-title {
            font-size: 1.4rem;
            font-weight: 600;
        }

        .endpoint-content {
            padding: 1.5rem;
        }

        .endpoint-desc {
            color: rgba(255, 255, 255, 0.8);
            margin-bottom: 1.5rem;
        }

        .status-badge {
            display: inline-block;
            background: var(--success);
            color: white;
            padding: 5px 12px;
            border-radius: 20px;
            font-size: 0.85rem;
            font-weight: 600;
            margin-bottom: 1rem;
        }

        .endpoint-links {
            display: flex;
            flex-wrap: wrap;
            gap: 10px;
        }

        .endpoint-link {
            display: inline-block;
            background: rgba(255, 255, 255, 0.1);
            color: white;
            padding: 10px 15px;
            border-radius: 8px;
            text-decoration: none;
            font-size: 0.9rem;
            transition: all 0.3s;
            border: 1px solid rgba(255, 255, 255, 0.2);
        }

        .endpoint-link:hover {
            background: var(--primary);
            transform: translateY(-2px);
        }

        .note {
            background: rgba(255, 255, 255, 0.05);
            padding: 15px;
            border-radius: 8px;
            margin: 15px 0;
            border-left: 4px solid var(--accent);
        }

        code {
            background: rgba(0, 0, 0, 0.3);
            padding: 2px 6px;
            border-radius: 4px;
            font-family: 'Courier New', monospace;
            color: var(--primary);
            font-size: 0.9rem;
        }

        .api-status {
            text-align: center;
            margin: 3rem 0;
            padding: 2rem;
            background: var(--glass);
            border-radius: 1rem;
            backdrop-filter: blur(10px);
        }

        .api-status h2 {
            font-size: 1.8rem;
            margin-bottom: 1rem;
            background: linear-gradient(45deg, #fff, #2196f3);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }

        .api-status p {
            color: rgba(255, 255, 255, 0.8);
            margin-bottom: 1rem;
        }

        .site-footer {
            margin-top: 5rem;
            padding-top: 3rem;
            border-top: 1px solid rgba(255, 255, 255, 0.1);
        }

        .footer-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 2rem;
            margin-bottom: 2rem;
        }

        .footer-section {
            padding: 1rem;
        }

        .footer-title {
            color: var(--primary);
            margin-bottom: 1rem;
            font-size: 1.1rem;
        }

        .footer-links {
            list-style: none;
        }

        .footer-links li {
            margin-bottom: 0.5rem;
        }

        .footer-links a {
            color: rgba(255, 255, 255, 0.8);
            text-decoration: none;
        }

        .footer-links a:hover {
            color: white;
            text-decoration: underline;
        }

        .social-links {
            display: flex;
            gap: 1rem;
            margin-top: 1rem;
        }

        .social-icon {
            font-size: 1.5rem;
            color: rgba(255, 255, 255, 0.8);
            transition: color 0.3s;
        }

        .social-icon:hover {
            color: var(--primary);
        }

        .footer-bottom {
            text-align: center;
            padding: 2rem 0;
            border-top: 1px solid rgba(255, 255, 255, 0.1);
            color: rgba(255, 255, 255, 0.7);
        }

        .legal-links {
            margin-top: 1rem;
        }

        .legal-links a {
            color: rgba(255, 255, 255, 0.7);
            margin: 0 0.5rem;
        }

        .abztech-logo {
            color: var(--primary);
            font-weight: bold;
        }

        @media (max-width: 768px) {
            .title {
                font-size: 2rem;
            }
            
            .features-grid {
                grid-template-columns: 1fr;
            }
            
            .footer-grid {
                grid-template-columns: 1fr;
            }
            
            .footer-section {
                text-align: center;
            }
            
            .social-links {
                justify-content: center;
            }
            
            .endpoint-links {
                flex-direction: column;
            }
            
            .endpoint-link {
                text-align: center;
            }
        }

        @media (max-width: 480px) {
            .container {
                padding: 1rem;
            }
            
            .title {
                font-size: 1.8rem;
            }
            
            .tagline {
                font-size: 1rem;
            }
            
            .endpoint-header {
                flex-direction: column;
                text-align: center;
                gap: 0.5rem;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <header class="header">
            <h1 class="title">🎬 ABZTECH Movie API</h1>
            <p class="tagline">Complete access to movies, TV series, and streaming sources</p>
            
            <div class="features-grid">
                <div class="feature-card">
                    <div class="feature-icon">
                        <i class="fas fa-search"></i>
                    </div>
                    <h3 class="feature-title">Real-time Search</h3>
                    <p class="feature-desc">Search for any movie or TV series and get real results from MovieBox database instantly.</p>
                </div>
                
                <div class="feature-card">
                    <div class="feature-icon">
                        <i class="fas fa-info-circle"></i>
                    </div>
                    <h3 class="feature-title">Detailed Information</h3>
                    <p class="feature-desc">Get comprehensive metadata including cast, description, ratings, and more.</p>
                </div>
                
                <div class="feature-card">
                    <div class="feature-icon">
                        <i class="fas fa-download"></i>
                    </div>
                    <h3 class="feature-title">Multiple Quality Downloads</h3>
                    <p class="feature-desc">Access working download links in multiple qualities from 360p to 1080p.</p>
                </div>
            </div>
        </header>

        <div class="main-content">
            <div class="endpoint-card">
                <div class="endpoint-header">
                    <div class="endpoint-icon">
                        <i class="fas fa-search"></i>
                    </div>
                    <h2 class="endpoint-title">Search Movies & TV Series</h2>
                </div>
                <div class="endpoint-content">
                    <p class="endpoint-desc">Search for any movie or TV series and get real results from MovieBox database.</p>
                    <span class="status-badge">OPERATIONAL</span>
                    <div class="endpoint-links">
                        <a href="/api/search/avatar" class="endpoint-link">Search: Avatar</a>
                        <a href="/api/search/spider-man" class="endpoint-link">Search: Spider-Man</a>
                        <a href="/api/search/wednesday" class="endpoint-link">Search: Wednesday</a>
                    </div>
                </div>
            </div>
            
            <div class="endpoint-card">
                <div class="endpoint-header">
                    <div class="endpoint-icon">
                        <i class="fas fa-info-circle"></i>
                    </div>
                    <h2 class="endpoint-title">Movie Information</h2>
                </div>
                <div class="endpoint-content">
                    <p class="endpoint-desc">Get detailed information about any movie including cast, description, ratings, and metadata.</p>
                    <span class="status-badge">OPERATIONAL</span>
                    <div class="endpoint-links">
                        <a href="/api/info/8906247916759695608" class="endpoint-link">Avatar Info</a>
                        <a href="/api/info/3815343854912427320" class="endpoint-link">Spider-Man Info</a>
                        <a href="/api/info/9028867555875774472" class="endpoint-link">Wednesday Info</a>
                    </div>
                </div>
            </div>
            
            <div class="endpoint-card">
                <div class="endpoint-header">
                    <div class="endpoint-icon">
                        <i class="fas fa-download"></i>
                    </div>
                    <h2 class="endpoint-title">Download Sources</h2>
                </div>
                <div class="endpoint-content">
                    <p class="endpoint-desc">Get real download links with multiple quality options. Includes both direct URLs and proxy URLs that work in browsers.</p>
                    <div class="note">
                        <strong>For Movies:</strong> Use movie ID only<br>
                        <strong>For TV Episodes:</strong> Add season and episode parameters: <code>?season=1&episode=1</code>
                    </div>
                    <span class="status-badge">OPERATIONAL</span>
                    <div class="endpoint-links">
                        <strong>Movie Downloads:</strong><br>
                        <a href="/api/sources/8906247916759695608" class="endpoint-link">Avatar Movie</a>
                        <a href="/api/sources/3815343854912427320" class="endpoint-link">Spider-Man Movie</a>
                        <br><br>
                        <strong>TV Episode Downloads:</strong><br>
                        <a href="/api/sources/9028867555875774472?season=1&episode=1" class="endpoint-link">Wednesday S1E1</a>
                        <a href="/api/sources/9028867555875774472?season=1&episode=2" class="endpoint-link">Wednesday S1E2</a>
                        <a href="/api/sources/9028867555875774472?season=1&episode=3" class="endpoint-link">Wednesday S1E3</a>
                    </div>
                </div>
            </div>
            
            <div class="endpoint-card">
                <div class="endpoint-header">
                    <div class="endpoint-icon">
                        <i class="fas fa-home"></i>
                    </div>
                    <h2 class="endpoint-title">Homepage Content</h2>
                </div>
                <div class="endpoint-content">
                    <p class="endpoint-desc">Get the latest homepage content from MovieBox including featured movies and recommendations.</p>
                    <span class="status-badge">OPERATIONAL</span>
                    <div class="endpoint-links">
                        <a href="/api/homepage" class="endpoint-link">View Homepage</a>
                    </div>
                </div>
            </div>
            
            <div class="endpoint-card">
                <div class="endpoint-header">
                    <div class="endpoint-icon">
                        <i class="fas fa-fire"></i>
                    </div>
                    <h2 class="endpoint-title">Trending Content</h2>
                </div>
                <div class="endpoint-content">
                    <p class="endpoint-desc">Get currently trending movies and TV series with real-time data from MovieBox.</p>
                    <span class="status-badge">OPERATIONAL</span>
                    <div class="endpoint-links">
                        <a href="/api/trending" class="endpoint-link">View Trending</a>
                    </div>
                </div>
            </div>
            
            <div class="endpoint-card">
                <div class="endpoint-header">
                    <div class="endpoint-icon">
                        <i class="fas fa-bolt"></i>
                    </div>
                    <h2 class="endpoint-title">Download Proxy</h2>
                </div>
                <div class="endpoint-content">
                    <p class="endpoint-desc">Proxy endpoint that adds proper headers to bypass CDN restrictions for direct downloads.</p>
                    <p><strong>Usage:</strong> <code>/api/download/[encoded-video-url]</code></p>
                    <div class="note">
                        Note: Video URLs are automatically provided in the sources endpoint response
                    </div>
                    <span class="status-badge">OPERATIONAL</span>
                </div>
            </div>
            
            <div class="api-status">
                <h2>API Status</h2>
                <p><strong>All 6 endpoints operational</strong> with real Movie data</p>
                <p>SuccessfulL Working Server<br>
                with region bypass and mobile authentication headers</p>
            </div>
        </div>

        <footer class="site-footer">
            <div class="footer-grid">
                <div class="footer-section">
                    <h4 class="footer-title">Movie API</h4>
                    <p>Complete access to movies, TV series, and streaming sources</p>
                    <div class="social-links">
                        <a href="https://wa.me//233533763772" class="social-icon"><i class="fab fa-whatsapp"></i></a>
                        <a href="#" class="social-icon"><i class="fab fa-twitter"></i></a>
                        <a href="#" class="social-icon"><i class="fab fa-linkedin"></i></a>
                    </div>
                </div>
                <div class="footer-section">
                    <h4 class="footer-title">Features</h4>
                    <ul class="footer-links">
                        <li><a href="#">Real-time Search</a></li>
                        <li><a href="#">Movie Information</a></li>
                        <li><a href="#">Download Sources</a></li>
                        <li><a href="#">Trending Content</a></li>
                    </ul>
                </div>
                <div class="footer-section">
                    <h4 class="footer-title">Legal</h4>
                    <ul class="footer-links">
                        <li><a href="#">Privacy Policy</a></li>
                        <li><a href="#">Terms of Service</a></li>
                        <li><a href="#">DMCA Compliance</a></li>
                        <li><a href="#">Cookie Policy</a></li>
                    </ul>
                </div>
                <div class="footer-section">
                    <h4 class="footer-title">Contact</h4>
                    <ul class="footer-links">
                        <li><a href="https://ab-tech.zone.id">ab-tech.zone.id</a></li>
                        <li><a href="tel:+233533763772">+233533763772</a></li>
                        <li><a href="https://api.whatsapp.com/send/?phone=233533763772" target="_blank">WhatsApp</a></li>
                    </ul>
                </div>
            </div>
            <div class="footer-bottom">
                <p>&copy; 2025 <span class="abztech-logo">ABZTech</span>. All rights reserved.</p>
                <div class="legal-links">
                    <a href="#">Privacy Policy</a> | 
                    <a href="#">Terms of Use</a> | 
                    <a href="#">Cookie Settings</a>
                </div>
            </div>
        </footer>
    </div>
</body>
</html>`;
    
    res.send(html);
});

// Homepage content
app.get('/api/homepage', async (req, res) => {
    try {
        const response = await makeApiRequest(`${HOST_URL}/wefeed-h5-bff/web/home`);
        const content = processApiResponse(response);
        
        res.json({
            status: 'success',
            data: content
        });
    } catch (error) {
        console.error('Homepage error:', error.message);
        res.status(500).json({
            status: 'error',
            message: 'Failed to fetch homepage content',
            error: error.message
        });
    }
});

// Trending content
app.get('/api/trending', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 0;
        const perPage = parseInt(req.query.perPage) || 18;
        
        const params = {
            page,
            perPage,
            uid: '5591179548772780352'
        };
        
        const response = await makeApiRequestWithCookies(`${HOST_URL}/wefeed-h5-bff/web/subject/trending`, {
            method: 'GET',
            params
        });
        
        const content = processApiResponse(response);
        
        res.json({
            status: 'success',
            data: content
        });
    } catch (error) {
        console.error('Trending error:', error.message);
        res.status(500).json({
            status: 'error',
            message: 'Failed to fetch trending content',
            error: error.message
        });
    }
});

// Search movies and TV series
app.get('/api/search/:query', async (req, res) => {
    try {
        const { query } = req.params;
        const page = parseInt(req.query.page) || 1;
        const perPage = parseInt(req.query.perPage) || 24;
        const subjectType = parseInt(req.query.type) || SubjectType.ALL;
        
        const payload = {
            keyword: query,
            page,
            perPage,
            subjectType
        };
        
        const response = await makeApiRequestWithCookies(`${HOST_URL}/wefeed-h5-bff/web/subject/search`, {
            method: 'POST',
            data: payload
        });
        
        let content = processApiResponse(response);
        
        // Filter results by subject type if specified
        if (subjectType !== SubjectType.ALL && content.items) {
            content.items = content.items.filter(item => item.subjectType === subjectType);
        }
        
        // Enhance each item with easily accessible thumbnail
        if (content.items) {
            content.items.forEach(item => {
                if (item.cover && item.cover.url) {
                    item.thumbnail = item.cover.url;
                }
                if (item.stills && item.stills.url && !item.thumbnail) {
                    item.thumbnail = item.stills.url;
                }
            });
        }
        
        res.json({
            status: 'success',
            data: content
        });
    } catch (error) {
        console.error('Search error:', error.message);
        res.status(500).json({
            status: 'error',
            message: 'Failed to search content',
            error: error.message
        });
    }
});

// Get movie/series detailed information
app.get('/api/info/:movieId', async (req, res) => {
    try {
        const { movieId } = req.params;
        
        const response = await makeApiRequestWithCookies(`${HOST_URL}/wefeed-h5-bff/web/subject/detail`, {
            method: 'GET',
            params: { subjectId: movieId }
        });
        
        const content = processApiResponse(response);
        
        // Add easily accessible thumbnail URLs
        if (content.subject) {
            if (content.subject.cover && content.subject.cover.url) {
                content.subject.thumbnail = content.subject.cover.url;
            }
            if (content.subject.stills && content.subject.stills.url && !content.subject.thumbnail) {
                content.subject.thumbnail = content.subject.stills.url;
            }
        }
        
        res.json({
            status: 'success',
            data: content
        });
    } catch (error) {
        console.error('Info error:', error.message);
        res.status(500).json({
            status: 'error',
            message: 'Failed to fetch movie/series info',
            error: error.message
        });
    }
});

// Get streaming sources/download links
app.get('/api/sources/:movieId', async (req, res) => {
    try {
        const { movieId } = req.params;
        const season = parseInt(req.query.season) || 0; // Movies use 0 for season
        const episode = parseInt(req.query.episode) || 0; // Movies use 0 for episode
        
        // First get movie details to get the detailPath for the referer
        console.log(`Getting sources for movieId: ${movieId}`);
        
        const infoResponse = await makeApiRequestWithCookies(`${HOST_URL}/wefeed-h5-bff/web/subject/detail`, {
            method: 'GET',
            params: { subjectId: movieId }
        });
        
        const movieInfo = processApiResponse(infoResponse);
        const detailPath = movieInfo?.subject?.detailPath;
        
        if (!detailPath) {
            throw new Error('Could not get movie detail path for referer header');
        }
        
        // Create the proper referer header - try fmovies domain based on user's working link
        const refererUrl = `https://fmoviesunblocked.net/spa/videoPlayPage/movies/${detailPath}?id=${movieId}&type=/movie/detail`;
        console.log(`Using referer: ${refererUrl}`);
        
        // Also try the sources endpoint with fmovies domain
        console.log('Trying fmovies domain for sources...');
        
        const params = {
            subjectId: movieId,
            se: season,
            ep: episode
        };
        
        // Try the original endpoint with region bypass headers
        const response = await makeApiRequestWithCookies(`${HOST_URL}/wefeed-h5-bff/web/subject/download`, {
            method: 'GET',
            params,
            headers: {
                'Referer': refererUrl,
                'Origin': 'https://fmoviesunblocked.net',
                // Add region bypass headers
                'X-Forwarded-For': '1.1.1.1',
                'CF-Connecting-IP': '1.1.1.1',
                'X-Real-IP': '1.1.1.1'
            }
        });
        
        const content = processApiResponse(response);
        
        // Process the sources to extract direct download links with proxy URLs
        if (content && content.downloads) {
            const sources = content.downloads.map(file => ({
                id: file.id,
                quality: file.resolution || 'Unknown',
                directUrl: file.url, // Original URL (blocked in browser)
                proxyUrl: `${req.protocol}://${req.get('host')}/api/download/${encodeURIComponent(file.url)}`, // Proxied URL with proper headers
                size: file.size,
                format: 'mp4'
            }));
            
            content.processedSources = sources;
        }
        
        res.json({
            status: 'success',
            data: content
        });
    } catch (error) {
        console.error('Sources error:', error.message);
        res.status(500).json({
            status: 'error',
            message: 'Failed to fetch streaming sources',
            error: error.message
        });
    }
});

// Download proxy endpoint with HTTP Range support for progressive streaming
app.get('/api/download/*', async (req, res) => {
    try {
        const downloadUrl = decodeURIComponent(req.url.replace('/api/download/', ''));
        
        if (!downloadUrl || (!downloadUrl.startsWith('https://bcdnw.hakunaymatata.com/') && !downloadUrl.startsWith('https://valiw.hakunaymatata.com/'))) {
            return res.status(400).json({
                status: 'error',
                message: 'Invalid download URL'
            });
        }
        
        console.log(`Proxying download with range support: ${downloadUrl}`);
        
        // Headers to forward to the CDN
        const headers = {
            'User-Agent': 'okhttp/4.12.0',
            'Referer': 'https://fmoviesunblocked.net/',
            'Origin': 'https://fmoviesunblocked.net',
            'Accept': '*/*',
            'Accept-Encoding': 'identity' // Important: disable gzip for video streaming
        };
        
        // Forward the Range header if present
        if (req.headers.range) {
            headers['Range'] = req.headers.range;
            console.log(`Forwarding range request: ${req.headers.range}`);
        }
        
        // Make the request to CDN
        const response = await axios({
            method: 'GET',
            url: downloadUrl,
            responseType: 'stream',
            headers: headers,
            timeout: 30000
        });
        
        // Handle successful response
        if (response.status === 200 || response.status === 206) {
            // Set appropriate headers for streaming
            res.set({
                'Content-Type': response.headers['content-type'],
                'Cache-Control': 'public, max-age=3600',
                'Accept-Ranges': 'bytes',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Range'
            });
            
            // Handle partial content (206)
            if (response.status === 206 && response.headers['content-range']) {
                res.status(206);
                res.set('Content-Range', response.headers['content-range']);
                res.set('Content-Length', response.headers['content-length']);
                console.log(`Serving partial content: ${response.headers['content-range']}`);
            } 
            // Handle full content (200)
            else if (response.status === 200 && response.headers['content-length']) {
                res.status(200);
                res.set('Content-Length', response.headers['content-length']);
                console.log(`Serving full content, length: ${response.headers['content-length']}`);
            }
            
            // Pipe the video stream to response
            response.data.pipe(res);
            
            // Handle stream errors
            response.data.on('error', (error) => {
                console.error('Stream error:', error.message);
                if (!res.headersSent) {
                    res.status(500).json({
                        status: 'error',
                        message: 'Stream error occurred'
                    });
                }
            });
            
        } else {
            throw new Error(`Unexpected response status: ${response.status}`);
        }
        
    } catch (error) {
        console.error('Download proxy error:', error.message);
        
        if (!res.headersSent) {
            res.status(500).json({
                status: 'error',
                message: 'Failed to proxy download',
                error: error.message
            });
        }
    }
});

// Add CORS support for range requests
app.options('/api/download/*', (req, res) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Range');
    res.status(200).send();
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({
        status: 'error',
        message: 'Internal server error',
        error: err.message
    });
});

// 404 handler
app.use('*', (req, res) => {
    res.status(404).json({
        status: 'error',
        message: 'Endpoint not found',
        availableEndpoints: [
            'GET /api/homepage',
            'GET /api/trending',
            'GET /api/search/:query',
            'GET /api/info/:movieId',
            'GET /api/sources/:movieId'
        ]
    });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`MovieBox API Server running on http://0.0.0.0:${PORT}`);
});

module.exports = app;
