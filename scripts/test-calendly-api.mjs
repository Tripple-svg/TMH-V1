const token = process.env.CALENDLY_API_TOKEN;
if (!token) { console.error('Set CALENDLY_API_TOKEN first'); process.exit(1); }

const res = await fetch('https://api.calendly.com/users/me', {
  headers: { Authorization: `Bearer ${token}` },
});
const data = await res.json();
console.log('Status:', res.status);
console.log(JSON.stringify(data, null, 2));