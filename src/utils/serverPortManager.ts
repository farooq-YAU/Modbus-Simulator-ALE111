import { ModbusServerInstance, ModbusTag } from "../types";

/**
 * Finds the next available WebSocket port starting from `startPort` (default: 5020)
 * that is not currently used by any existing TCP server.
 */
export function getNextAvailablePort(
  existingServers: (ModbusServerInstance | { port?: number; id?: string })[],
  startPort = 5020
): number {
  const usedPorts = new Set<number>();
  existingServers.forEach(s => {
    if (s.port && s.port > 0) {
      usedPorts.add(s.port);
    } else if (s.id && s.id.includes(":")) {
      const p = parseInt(s.id.split(":")[1], 10);
      if (!isNaN(p) && p > 0) {
        usedPorts.add(p);
      }
    }
  });

  let port = startPort;
  while (usedPorts.has(port)) {
    port++;
  }
  return port;
}

/**
 * Ensures that every distinct Modbus TCP slave has a unique WebSocket port.
 * If 2 or more TCP servers share the same port (e.g. multiple slaves with 5020),
 * this function reassigns distinct sequential ports (e.g. 5020, 5021, 5022...)
 * so that each websocat instance can bind to its own dedicated port without address collision.
 */
export function ensureUniqueServerPorts(
  tags: ModbusTag[],
  servers: ModbusServerInstance[] = []
): {
  tags: ModbusTag[];
  servers: ModbusServerInstance[];
  idMap: Map<string, string>;
  hasChanges: boolean;
} {
  // 1. Collect all distinct server identifiers from tags and servers list
  const idSet = new Set<string>();
  servers.forEach(s => s?.id && idSet.add(s.id.trim()));
  tags.forEach(t => t?.serverId && idSet.add(t.serverId.trim()));

  // 2. Identify TCP servers vs RTU servers
  const tcpServers: { origId: string; host: string; port: number }[] = [];
  idSet.forEach(id => {
    const isRtu = id.startsWith("RTU") || id.startsWith("COM") || !id.includes(":");
    if (!isRtu) {
      const parts = id.split(":");
      const host = parts[0] || "127.0.0.1";
      const port = parseInt(parts[1], 10) || 5020;
      tcpServers.push({ origId: id, host, port });
    }
  });

  // Check if any port collision exists across distinct servers
  const portToServers = new Map<number, string[]>();
  tcpServers.forEach(ts => {
    const list = portToServers.get(ts.port) || [];
    list.push(ts.origId);
    portToServers.set(ts.port, list);
  });

  let hasCollision = false;
  portToServers.forEach(serverIds => {
    if (serverIds.length > 1) {
      hasCollision = true;
    }
  });

  if (!hasCollision) {
    return {
      tags,
      servers,
      idMap: new Map(),
      hasChanges: false
    };
  }

  // Resolve collisions by assigning distinct ports
  const idMap = new Map<string, string>(); // oldId -> newId
  const assignedPorts = new Set<number>();
  let nextFreePort = 5020;

  tcpServers.forEach(ts => {
    let portToUse = ts.port;
    if (assignedPorts.has(portToUse)) {
      // Find next free port
      while (assignedPorts.has(nextFreePort)) {
        nextFreePort++;
      }
      portToUse = nextFreePort++;
    }
    assignedPorts.add(portToUse);

    const newId = `${ts.host}:${portToUse}`;
    if (newId !== ts.origId) {
      idMap.set(ts.origId, newId);
    }
  });

  if (idMap.size === 0) {
    return {
      tags,
      servers,
      idMap,
      hasChanges: false
    };
  }

  // Update tags
  const updatedTags = tags.map(t => {
    if (t.serverId && idMap.has(t.serverId)) {
      const newServerId = idMap.get(t.serverId)!;
      return {
        ...t,
        serverId: newServerId
      };
    }
    return t;
  });

  // Update server instances
  const updatedServers = servers.map(s => {
    if (s.id && idMap.has(s.id)) {
      const newId = idMap.get(s.id)!;
      const port = parseInt(newId.split(":")[1], 10);
      return {
        ...s,
        id: newId,
        port
      };
    }
    return s;
  });

  return {
    tags: updatedTags,
    servers: updatedServers,
    idMap,
    hasChanges: true
  };
}

/**
 * Reassigns the WebSocket port for a specific server instance,
 * updating all corresponding tags, server instances, and memory partition references.
 */
export function reassignServerPort(
  oldServerId: string,
  newPort: number,
  tags: ModbusTag[],
  servers: ModbusServerInstance[]
): {
  tags: ModbusTag[];
  servers: ModbusServerInstance[];
  newServerId: string;
} {
  const parts = oldServerId.split(":");
  const host = parts[0] || "127.0.0.1";
  const newServerId = `${host}:${newPort}`;

  const updatedTags = tags.map(t => {
    if (t.serverId === oldServerId) {
      return {
        ...t,
        serverId: newServerId
      };
    }
    return t;
  });

  const updatedServers = servers.map(s => {
    if (s.id === oldServerId) {
      return {
        ...s,
        id: newServerId,
        port: newPort
      };
    }
    return s;
  });

  return {
    tags: updatedTags,
    servers: updatedServers,
    newServerId
  };
}
