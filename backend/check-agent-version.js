const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function checkAgentVersion() {
  try {
    // Check current agent version in database
    const agentVersion = await prisma.agent_versions.findFirst({
      where: { version: '1.2.6' }
    });
    
    if (agentVersion) {
      console.log('✅ Agent version 1.2.6 found in database');
      console.log('Version:', agentVersion.version);
      console.log('Is Default:', agentVersion.is_default);
      console.log('Script Content Length:', agentVersion.script_content?.length || 0);
      console.log('Created At:', agentVersion.created_at);
      console.log('Updated At:', agentVersion.updated_at);
      
      // Check if script content contains the current version
      if (agentVersion.script_content && agentVersion.script_content.includes('AGENT_VERSION="1.2.6"')) {
        console.log('✅ Script content contains correct version 1.2.6');
      } else {
        console.log('❌ Script content does not contain version 1.2.6');
      }
      
      // Check if script content contains system info functions
      if (agentVersion.script_content && agentVersion.script_content.includes('get_hardware_info()')) {
        console.log('✅ Script content contains hardware info function');
      } else {
        console.log('❌ Script content missing hardware info function');
      }
      
      if (agentVersion.script_content && agentVersion.script_content.includes('get_network_info()')) {
        console.log('✅ Script content contains network info function');
      } else {
        console.log('❌ Script content missing network info function');
      }
      
      if (agentVersion.script_content && agentVersion.script_content.includes('get_system_info()')) {
        console.log('✅ Script content contains system info function');
      } else {
        console.log('❌ Script content missing system info function');
      }
      
    } else {
      console.log('❌ Agent version 1.2.6 not found in database');
    }
    
    // List all agent versions
    console.log('\n=== All Agent Versions ===');
    const allVersions = await prisma.agent_versions.findMany({
      orderBy: { created_at: 'desc' }
    });
    
    allVersions.forEach(version => {
      console.log(`Version: ${version.version}, Default: ${version.is_default}, Length: ${version.script_content?.length || 0}`);
    });
    
  } catch (error) {
    console.error('❌ Error checking agent version:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkAgentVersion();