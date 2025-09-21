const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
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
    
    const existingVersion = await prisma.agent_versions.findUnique({
      where: { version: currentVersion }
    });
    
    if (existingVersion) {
      console.log('Updating existing agent version', currentVersion, 'with latest script content...');
      await prisma.agent_versions.update({
        where: { version: currentVersion },
        data: {
          script_content: agentScript,
          is_current: true,
          release_notes: `Version ${currentVersion} - Updated Agent Script\n\nThis version contains the latest agent script from the Docker container initialization.`,
          download_url: `/api/v1/hosts/agent/download?version=${currentVersion}`,
          updated_at: new Date()
        }
      });
      console.log('Agent version', currentVersion, 'updated successfully');
    } else {
      console.log('Creating new agent version', currentVersion, '...');
      await prisma.agent_versions.create({
        data: {
          id: uuidv4(),
          version: currentVersion,
          script_content: agentScript,
          is_current: true,
          is_default: true,
          release_notes: `Version ${currentVersion} - Docker Agent Script\n\nThis version contains the agent script from the Docker container initialization.`,
          download_url: `/api/v1/hosts/agent/download?version=${currentVersion}`,
          min_server_version: '1.2.0',
          updated_at: new Date()
        }
      });
      console.log('Agent version', currentVersion, 'created successfully');
    }
    
    await prisma.agent_versions.updateMany({
      where: { version: { not: currentVersion } },
      data: { 
        is_current: false,
        updated_at: new Date()
      }
    });
    
    const allVersions = await prisma.agent_versions.findMany({
      orderBy: { version: 'desc' }
    });
    
    for (const version of allVersions) {
      if (version.version !== currentVersion && compareVersions(currentVersion, version.version) > 0) {
        console.log('🔄 Updating older version', version.version, 'with new script content...');
        await prisma.agent_versions.update({
          where: { id: version.id },
          data: {
            script_content: agentScript,
            release_notes: `Version ${version.version} - Updated with latest script from ${currentVersion}\n\nThis version has been updated with the latest agent script content.`,
            updated_at: new Date()
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