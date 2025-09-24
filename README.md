## Purpose

PatchMon provides centralized patch management across diverse server environments. Agents communicate outbound-only to the PatchMon server, eliminating inbound ports on monitored hosts while delivering comprehensive visibility and safe automation.

## Features

### Users & Authentication
- Multi-user accounts (admin and standard users)
- Email/username-based login
- Optional Two‑Factor Authentication (TFA/MFA) with verification flow
- First‑time admin bootstrap flow (no default credentials; secure setup)
- Self‑registration toggle in settings (enable/disable public signup)

### Roles, Permissions & RBAC
- Built‑in roles: `admin`, `user`
- Fine‑grained permission flags (e.g., view/manage hosts, packages, users, reports, settings)
- Server‑side enforcement for protected routes and UI guards per permission

### Dashboard
- Customisable dashboard with per‑user card layout and ordering
- Role/permission‑aware defaults on first login
- “Reset to Defaults” uses consistent server‑provided defaults
- Cards include: Total Hosts, Needs Updating, Up‑to‑Date Hosts, Host Groups, Outdated Packages, Security Updates, Package Priority, Repositories, Users, OS Distribution (pie/bar), Update Status, Recent Collection, Recent Users, Quick Stats

### Hosts & Inventory
- Host inventory with key attributes and OS details
- Host grouping (create and manage host groups)
- OS distribution summaries and visualisations
- Recent telemetry collection indicator

### Packages & Updates
- Package inventory across hosts
- Outdated packages overview and counts
- Security updates highlight
- Update status breakdown (up‑to‑date vs needs updates)

### Repositories
- Repositories per host tracking
- Repository module pages and totals

### Agent & Data Collection
- Outbound‑only agent communication (no inbound ports required on hosts)
- Agent version management and script content stored in DB
- Version marking (current/default) with update history

### Settings & Configuration
- Server URL/protocol/host/port
- Update interval and auto‑update toggle
- Public signup toggle and default user role selection
- Repository settings: GitHub repo URL, repository type, SSH key path
- Rate‑limit windows and thresholds for API/auth/agent

### Admin & User Management
- Admin user CRUD (create, list, update, delete)
- Password reset (admin‑initiated)
- Role assignment on user create/update

### Reporting & Analytics
- Dashboard stats and card‑level metrics
- OS distribution charts (pie/bar)
- Update status and recent activity summaries

### API & Integrations
- REST API under `/api/v1` with JWT auth
- Consistent JSON responses; errors with appropriate status codes
- CORS configured per server settings

### Security
- JWT‑secured API with short, scoped tokens
- Permissions enforced server‑side on every route
- Rate limiting for general, auth, and agent endpoints
- Outbound‑only agent model reduces attack surface

### Deployment & Operations
- One‑line self‑host installer (Ubuntu/Debian)
- Automated provisioning: Node.js, PostgreSQL, nginx
- Prisma migrations and client generation
- systemd service for backend lifecycle
- nginx vhost for frontend + API proxy; optional Let’s Encrypt integration
- Consolidated deployment info file with commands and paths

### UX & Frontend
- Vite + React single‑page app
- Protected routes with permission checks
- Theming and modern components (icons, modals, notifications)

### Observability & Logging
- Structured server logs
- Deployment logs copied to instance dir for later review

### Road‑Readiness
- Works for internal (HTTP) and public (HTTPS) deployments
- Defaults safe for first‑time setup; admin created interactively

## Communication Model

- Outbound-only agents: servers initiate communication to PatchMon
- No inbound connections required on monitored servers
- Secure server-side API with JWT authentication and rate limiting

## Architecture

- Backend: Node.js/Express + Prisma + PostgreSQL
- Frontend: Vite + React
- Reverse proxy: nginx
- Database: PostgreSQL
- System service: systemd-managed backend

```
+----------------------+    HTTPS    +--------------------+    HTTP    +------------------------+    TCP    +---------------+
|  End Users (Browser) | --------->  |       nginx        | --------> | Backend (Node/Express) | ------> |  PostgreSQL   |
|  Admin UI / Frontend |            | serve FE, proxy API|           |  /api, auth, Prisma    |         |   Database    |
+----------------------+            +--------------------+           +------------------------+         +---------------+

Agents (Outbound Only)
+---------------------------+    HTTPS    +------------------------+
|  Agents on your servers   | ----------> | Backend API (/api/v1)  |
+---------------------------+             +------------------------+

Operational
- systemd manages backend service
- certbot/nginx for TLS (public)
- setup.sh bootstraps OS, app, DB, config
```

## Getting Started

### PatchMon Cloud (coming soon)

Managed, zero-maintenance PatchMon hosting. Stay tuned.

### Self-hosted Installation

Run on a clean Ubuntu/Debian server with internet access:

```bash
curl -fsSL -o setup.sh https://raw.githubusercontent.com/9technologygroup/patchmon.net/main/setup.sh && chmod +x && bash setup.sh
```

During setup you’ll be asked:
- Domain/IP: public DNS or local IP (default: `patchmon.internal`)
- SSL/HTTPS: `y` for public deployments with a public IP, `n` for internal networks
- Email: only if SSL is enabled (for Let’s Encrypt)
- Git Branch: default is `main` (press Enter)

The script will:
- Install prerequisites (Node.js, PostgreSQL, nginx)
- Clone the repo, install dependencies, build the frontend, run migrations
- Create a systemd service and nginx site vhost config
- Start the service and write a consolidated info file at:
  - `/opt/<your-domain>/deployment-info.txt`
  - Copies the full installer log to `/opt/<your-domain>/patchmon-install.log` from /var/log/patchmon-install.log

After installation:
- Visit `http(s)://<your-domain>` and complete first-time admin setup
- See all useful info in `deployment-info.txt`

## Support

- Discord: https://discord.gg/S7RXUHwg
- Email: support@patchmon.net

## Roadmap

- PatchMon Cloud (managed offering)
- Additional dashboards and reporting widgets
- More OS distributions and agent enhancements
- Advanced workflow automations and approvals

Roadmap board: https://github.com/users/9technologygroup/projects/1

## Security

- Outbound-only agent communications; no inbound ports on monitored hosts
- JWT-based API auth, rate limiting, role/permission checks
- Follow least-privilege defaults; sensitive operations audited

## Support Methods

- Community: Discord for quick questions and feedback
- Email: SLA-backed assistance for incidents and issues
- GitHub Issues: bug reports and feature requests

## License

AGPLv3 (More information on this soon)

## Links

- Repository: https://github.com/9technologygroup/patchmon.net/
- Raw installer: https://raw.githubusercontent.com/9technologygroup/patchmon.net/main/setup.sh
---


# PatchMon

[![Discord](https://img.shields.io/badge/Discord-Join%20Server-blue?style=for-the-badge&logo=discord)](https://discord.gg/S7RXUHwg)
[![GitHub](https://img.shields.io/badge/GitHub-Repository-black?style=for-the-badge&logo=github)](https://github.com/9technologygroup/patchmon.net)
[![Roadmap](https://img.shields.io/badge/Roadmap-View%20Progress-green?style=for-the-badge&logo=github)](https://github.com/users/9technologygroup/projects/1)



---

## 🤝 Contributing

We welcome contributions from the community! Here's how you can get involved:

### Development Setup
1. **Fork the Repository**
   ```bash
   # Click the "Fork" button on GitHub, then clone your fork
   git clone https://github.com/YOUR_USERNAME/patchmon.net.git
   cd patchmon.net
   ```

2. **Create a Feature Branch**
   ```bash
   git checkout -b feature/your-feature-name
   # or
   git checkout -b fix/your-bug-fix
   ```


4. **Make Your Changes**
   - Write clean, well-documented code
   - Follow existing code style and patterns
   - Add tests for new functionality
   - Update documentation as needed

5. **Test Your Changes**
   ```bash
   # Run backend tests
   cd backend
   npm test
   
   # Run frontend tests
   cd ../frontend
   npm test
   ```

6. **Commit and Push**
   ```bash
   git add .
   git commit -m "Add: descriptive commit message"
   git push origin feature/your-feature-name
   ```

7. **Create a Pull Request**
   - Go to your fork on GitHub
   - Click "New Pull Request"
   - Provide a clear description of your changes
   - Link any related issues

### Contribution Guidelines
- **Code Style**: Follow the existing code patterns and ESLint configuration
- **Commits**: Use conventional commit messages (feat:, fix:, docs:, etc.)
- **Testing**: Ensure all tests pass and add tests for new features
- **Documentation**: Update README and code comments as needed
- **Issues**: Check existing issues before creating new ones

### Areas We Need Help With
- 🐳 **Docker & Containerization** (led by @Adam20054)
- 🔄 **CI/CD Pipelines** (led by @tigattack)
- 🔒 **Security Improvements** - Security audits, vulnerability assessments, and security feature enhancements
- ⚡ **Performance for Large Scale Deployments** - Database optimization, caching strategies, and horizontal scaling
- 📚 **Documentation** improvements
- 🧪 **Testing** coverage
- 🌐 **Internationalization** (i18n)
- 📱 **Mobile** responsive improvements
- 

---

## 🗺️ Roadmap

Check out our [public roadmap](https://github.com/users/9technologygroup/projects/1) to see what we're working on and what's coming next!

**Upcoming Features:**
- 🐳 Docker Compose deployment
- 🔄 Automated CI/CD pipelines
- 📊 Advanced reporting and analytics
- 🔔 Enhanced notification system
- 📱 Mobile application
- 🔄 Patch management workflows and policies
- 👥 Users inventory management
- 🔍 Services and ports monitoring
- 🖥️ Proxmox integration for auto LXC discovery and registration
- 📧 Notifications via Slack/Email

---

## 🏢 Enterprise & Custom Solutions

### PatchMon Cloud
- **Fully Managed**: We handle all infrastructure and maintenance
- **Scalable**: Grows with your organization
- **Secure**: Enterprise-grade security and compliance
- **Support**: Dedicated support team

### Custom Integrations
- **API Development**: Custom endpoints for your specific needs
- **Third-Party Integrations**: Connect with your existing tools
- **Custom Dashboards**: Tailored reporting and visualization
- **White-Label Solutions**: Brand PatchMon as your own

### Enterprise Deployment
- **On-Premises**: Deploy in your own data center
- **Air-Gapped**: Support for isolated environments
- **Compliance**: Meet industry-specific requirements
- **Training**: Comprehensive team training and onboarding

*Contact us at support@patchmon.net for enterprise inquiries*

---



---

## 📞 Support & Community

### Get Help
- 💬 **Discord Community**: [Join our Discord](https://discord.gg/S7RXUHwg) for real-time support and discussions
- 📧 **Email Support**: support@patchmon.net
- 📚 **Documentation**: Check our wiki and documentation
- 🐛 **Bug Reports**: Use GitHub Issues

### Community
- 🌟 **Star the Project**: Show your support by starring this repository
- 🍴 **Fork & Contribute**: Help improve PatchMon
- 📢 **Share**: Tell others about PatchMon
- 💡 **Feature Requests**: Suggest new features via GitHub Issues

---

## 🙏 Acknowledgments

### Special Thanks
- **Jonathan Higson** - For inspiration, ideas, and valuable feedback
- **@Adam20054** - For working on Docker Compose deployment
- **@tigattack** - For working on GitHub CI/CD pipelines
- **Cloud X** and **Crazy Dead** - For moderating our Discord server and keeping the community awesome

### Contributors
Thank you to all our contributors who help make PatchMon better every day!


## 🔗 Links

- **Website**: [patchmon.net](https://patchmon.net)
- **Discord**: [discord.gg/S7RXUHwg](https://discord.gg/S7RXUHwg)
- **Roadmap**: [GitHub Projects](https://github.com/users/9technologygroup/projects/1)
- **Documentation**: [Coming Soon]
- **Support**: support@patchmon.net

---

<div align="center">

**Made with ❤️ by the PatchMon Team**

[![Discord](https://img.shields.io/badge/Discord-Join%20Server-blue?style=for-the-badge&logo=discord)](https://discord.gg/S7RXUHwg)
[![GitHub](https://img.shields.io/badge/GitHub-Repository-black?style=for-the-badge&logo=github)](https://github.com/9technologygroup/patchmon.net)

</div>