---
description: how to deploy barracao-reversa to Vercel
---

// turbo-all

1. Stage and commit all changes:
```
git add -A; git commit -m "[describe changes]"
```

2. Push to GitHub (triggers auto-deploy on Vercel via GitHub integration):
```
git push origin main
```

> If GitHub is not connected to Vercel yet, also run:
> `vercel --prod --yes` in `c:\Projetos\barracao-reversa`
