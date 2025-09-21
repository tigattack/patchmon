const fs = require('fs');
const path = require('path');
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

function compareVersions(version1, version2) {
  const v1parts = version1.split('.').map(Number);
  const v2parts = version2.split('.').map(Number);
  
  for (let i = 0; i < Math.max(v1parts.length, v2parts.length); i++) {
    const v1part = v1parts[i] || 0;
    const v2part = v2parts[i] || 0;
    
    if (v1part > v2part) return 1;
    if (v1part < v2part) return -1;
  }
  return 0;
}

async function populateAgentVersion() {
  try {
    const agentScriptPath = path.join(__dirname, 'agents', 'patchmon-agent.sh');
    
    if (!fs.existsSync(agentScriptPath)) {
      console.log('Agent script not found at:', agentScriptPath);
      console.log('Skipping agent version population - this is expected if agents folder is not mounted');
      return;
    }

    const agentScript = fs.readFileSync(agentScriptPath, 'utf8');
    
    const versionMatch = agentScript.match(/^AGENT_VERSION="([^"]*)"/m);
    const currentVersion = versionMatch ? versionMatch[1] : '1.2.5';
    
    console.log('Populating agent version:', currentVersion);
    
    const existingVersion = await prisma.agentVersion.findUnique({
      where: { version: currentVersion }
    });
    
    if (existingVersion) {
      console.log('Updating existing agent version', currentVersion, 'with latest script content...');
      await prisma.agentVersion.update({
        where: { version: currentVersion },
        data: {
          scriptContent: agentScript,
          isCurrent: true,
          releaseNotes: `Version ${currentVersion} - Updated Agent Script\n\nThis version contains the latest agent script from the Docker container initialization.`
        }
      });
      console.log('Agent version', currentVersion, 'updated successfully');
    } else {
      console.log('Creating new agent version', currentVersion, '...');
      await prisma.agentVersion.create({
        data: {
          version: currentVersion,
          scriptContent: agentScript,
          isCurrent: true,
          isDefault: true,
          releaseNotes: `Version ${currentVersion} - Docker Agent Script\n\nThis version contains the agent script from the Docker container initialization.`
        }
      });
      console.log('Agent version', currentVersion, 'created successfully');
    }
    
    await prisma.agentVersion.updateMany({
      where: { version: { not: currentVersion } },
      data: { isCurrent: false }
    });
    
    const allVersions = await prisma.agentVersion.findMany({
      orderBy: { version: 'desc' }
    });
    
    for (const version of allVersions) {
      if (version.version !== currentVersion && compareVersions(currentVersion, version.version) > 0) {
        console.log('🔄 Updating older version', version.version, 'with new script content...');
        await prisma.agentVersion.update({
          where: { id: version.id },
          data: {
            scriptContent: agentScript,
            releaseNotes: `Version ${version.version} - Updated with latest script from ${currentVersion}\n\nThis version has been updated with the latest agent script content.`
          }
        });
      }
    }
    
    console.log('Agent version population completed successfully');
  } catch (error) {
    console.error('Error populating agent version:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  populateAgentVersion();
}

module.exports = { populateAgentVersion };