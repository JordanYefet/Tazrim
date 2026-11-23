/**
 * The old entry point (ENG-136): compose files written before the launcher still say
 * `node /app/updater/server.mjs`, and `docker compose pull updater && up -d updater` must keep
 * working with them. It starts the launcher.
 */
import { main } from './launcher.mjs'

main()
