import { spawn } from 'child_process';

console.log("Starting Aura Music Server...");

const projectPath = 'c:\\Users\\user\\Desktop\\music-web';

// 1. Start Next.js in Production Mode for maximum speed
const nextjs = spawn('npm', ['run', 'start'], { cwd: projectPath, shell: true, stdio: 'ignore' });

// 2. Start Ngrok
const ngrok = spawn('ngrok', ['http', '3000'], { cwd: projectPath, shell: true, stdio: 'ignore' });

console.log("Waiting for servers to initialize...");

// 3. Fetch URL and send notification
setTimeout(async () => {
    try {
        const res = await fetch('http://127.0.0.1:4040/api/tunnels');
        const data = await res.json();
        
        if (data.tunnels && data.tunnels.length > 0) {
            const url = data.tunnels[0].public_url;
            console.log("Ngrok URL created:", url);
            
            // Send push notification via ntfy.sh
            const topic = 'aura_music_link_8472';
            await fetch(`https://ntfy.sh/${topic}`, {
                method: 'POST',
                body: `السيرفر اشتغل! الرابط الجديد: ${url}`,
                headers: {
                    'Title': 'Aura Music is Online!',
                    'Click': url,
                    'Tags': 'headphones,rocket'
                }
            });
            console.log("Notification sent successfully!");
        } else {
            console.log("No tunnels found.");
        }
    } catch (err) {
        console.error("Error fetching ngrok URL:", err.message);
    }
}, 8000);
