const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function checkAgentVersion() {
  try {
    // Check current agent version in database
    const agentVersion = await prisma.agentVersion.findFirst({
      where: { version: '1.2.5' }
    });
    
    if (agentVersion) {
      console.log('✅ Agent version 1.2.5 found in database');
      console.log('Version:', agentVersion.version);
      console.log('Is Default:', agentVersion.isDefault);
      console.log('Script Content Length:', agentVersion.scriptContent?.length || 0);
      console.log('Created At:', agentVersion.createdAt);
      console.log('Updated At:', agentVersion.updatedAt);
      
      // Check if script content contains the current version
      if (agentVersion.scriptContent && agentVersion.scriptContent.includes('AGENT_VERSION="1.2.5"')) {
        console.log('✅ Script content contains correct version 1.2.5');
      } else {
        console.log('❌ Script content does not contain version 1.2.5');
      }
      
      // Check if script content contains system info functions
      if (agentVersion.scriptContent && agentVersion.scriptContent.includes('get_hardware_info()')) {
        console.log('✅ Script content contains hardware info function');
      } else {
        console.log('❌ Script content missing hardware info function');
      }
      
      if (agentVersion.scriptContent && agentVersion.scriptContent.includes('get_network_info()')) {
        console.log('✅ Script content contains network info function');
      } else {
        console.log('❌ Script content missing network info function');
      }
      
      if (agentVersion.scriptContent && agentVersion.scriptContent.includes('get_system_info()')) {
        console.log('✅ Script content contains system info function');
      } else {
        console.log('❌ Script content missing system info function');
      }
      
    } else {
      console.log('❌ Agent version 1.2.5 not found in database');
    }
    
    // List all agent versions
    console.log('\n=== All Agent Versions ===');
    const allVersions = await prisma.agentVersion.findMany({
      orderBy: { createdAt: 'desc' }
    });
    
    allVersions.forEach(version => {
      console.log(`Version: ${version.version}, Default: ${version.isDefault}, Length: ${version.scriptContent?.length || 0}`);
    });
    
  } catch (error) {
    console.error('❌ Error checking agent version:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkAgentVersion();