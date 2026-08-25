import { Composio } from '@composio/core';
const client = new Composio({ apiKey: 'ak_fCyyEyny9xQrq9slmGhL' });

const IMAGE_URL = "https://3days-apac.downloadaivideo.com/stable/users/6931370018e557005ab1b3d1/gpt_image/b496753360da71db2dd02fad2da1f167_1_1787542766_2004.jpg";
const CAPTION = "Professional legal news coverage. ⚖️ Your trusted voice for justice. #LegalNews #PersonalInjury #Attorney";
const pickId = (v) => v?.data?.id || v?.id || v?.data?.data?.id || null;

async function main() {
  let session = null;
  for (let i = 0; i < 120; i++) {  // 10 min max
    await new Promise(r => setTimeout(r, 5000));
    
    const r = await client.connectedAccounts.list({ userId: 'admin' });
    const ig = (r.items || []).filter(a => (a.toolkit?.slug || a.toolkit) === 'instagram');
    const active = ig.find(a => a.status === 'ACTIVE');
    const now = new Date().toISOString().slice(11, 19);
    
    console.log(`[${now}] IG: ${ig.map(a => `${a.id.slice(3,12)}:${a.status}`).join(', ')}`);
    
    if (active) {
      console.log(`\n✅ ACTIVE: ${active.id}`);
      
      // Create fresh session and pin the active account
      session = await client.sessions.create('admin', {
        manageConnections: false,
        connectedAccounts: { instagram: [active.id] }
      });
      console.log(`Session: ${session.sessionId}`);
      
      // Get IG user info
      const info = await session.execute('INSTAGRAM_GET_USER_INFO', { arguments: {} });
      const igUserId = pickId(info);
      console.log(`IG User ID: ${igUserId}`);
      if (!igUserId) { console.log('info:', JSON.stringify(info).slice(0,500)); continue; }
      
      // Create container
      console.log('Creating media container...');
      const created = await session.execute('INSTAGRAM_CREATE_MEDIA_CONTAINER', {
        arguments: { ig_user_id: igUserId, caption: CAPTION, image_url: IMAGE_URL }
      });
      const creationId = pickId(created);
      console.log(`Creation ID: ${creationId}`);
      if (!creationId) { console.log('created:', JSON.stringify(created).slice(0,500)); continue; }
      
      // Publish
      console.log('Publishing...');
      const published = await session.execute('INSTAGRAM_CREATE_POST', {
        arguments: { ig_user_id: igUserId, creation_id: creationId }
      });
      const mediaId = pickId(published);
      console.log(`\n🎉🎉🎉 POSTED TO INSTAGRAM! Media ID: ${mediaId}`);
      return;
    }
  }
  console.log('\n⏰ Timeout. Operator needs to complete the OAuth at https://connect.composio.dev/link/lk_yEACNRQervfE');
}

main().catch(e => { console.error('FATAL:', e.cause?.error?.message || e.message); process.exit(1); });
