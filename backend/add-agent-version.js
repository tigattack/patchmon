const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

async function addAgentVersion() {
  try {
    console.log('🚀 Adding agent version to database...');
    
    // Read the agent script file
    const agentScriptPath = path.join(__dirname, '..', 'agents', 'patchmon-agent.sh');
    
    if (!fs.existsSync(agentScriptPath)) {
      throw new Error(`Agent script not found at: ${agentScriptPath}`);
    }
    
    const scriptContent = fs.readFileSync(agentScriptPath, 'utf8');
    console.log(`📄 Read agent script (${scriptContent.length} characters)`);
    
    // Extract version from script content
    const versionMatch = scriptContent.match(/AGENT_VERSION="([^"]+)"/);
    if (!versionMatch) {
      throw new Error('Could not extract AGENT_VERSION from script');
    }
    
    const version = versionMatch[1];
    console.log(`🔍 Found agent version: ${version}`);
    
    // Check if this version already exists
    const existingVersion = await prisma.agentVersion.findUnique({
      where: { version: version }
    });
    
    if (existingVersion) {
      console.log(`⚠️  Agent version ${version} already exists in database`);
      
      // Update the existing version with current script content
      const updatedVersion = await prisma.agentVersion.update({
        where: { version: version },
        data: {
          scriptContent: scriptContent,
          isDefault: true,
          isCurrent: true,
          releaseNotes: `Agent script version ${version} - Updated during deployment`
        }
      });
      
      console.log(`✅ Updated existing agent version ${version}`);
      return updatedVersion;
    }
    
    // Set all other versions to not be current/default
    await prisma.agentVersion.updateMany({
      where: {
        version: { not: version }
      },
      data: {
        isCurrent: false,
        isDefault: false
      }
    });
    
    // Create new agent version
    const newVersion = await prisma.agentVersion.create({
      data: {
        version: version,
        scriptContent: scriptContent,
        isDefault: true,
        isCurrent: true,
        releaseNotes: `Agent script version ${version} - Initial deployment`
      }
    });
    
    console.log(`✅ Created new agent version ${version}`);
    console.log(`📊 Version ID: ${newVersion.id}`);
    console.log(`📝 Script content length: ${scriptContent.length} characters`);
    
    return newVersion;
    
  } catch (error) {
    console.error('❌ Error adding agent version:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the function if this script is executed directly
if (require.main === module) {
  addAgentVersion()
    .then(() => {
      console.log('🎉 Agent version setup completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Agent version setup failed:', error);
      process.exit(1);
    });
}

module.exports = { addAgentVersion };