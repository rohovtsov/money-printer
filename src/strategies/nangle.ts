import { Address, EthMarket, GroupedEthMarkets, groupEthMarkets, MarketAction } from '../entities';
import { isInteger } from 'lodash';

export interface Nangle<T extends EthMarket = EthMarket> {
  markets: T[];
  actions: MarketAction[];
  startToken: Address;
}

export function nangleCountsToString(nangles: Nangle[]): string {
  const counts = nangles.reduce((acc, nangle) => {
    const key = String(nangle.markets.length);
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return [
    `total: ${nangles.length}`,
    ...Object.keys(counts).map((count) => `${count}-angles: ${counts[count]}`),
  ].join(', ');
}

interface GraphNode {
  id: string;
  address: Address;
  market?: EthMarket;
  connections: GraphNode[];
}

type Graph = Record<Address, GraphNode>;

/*
a => 1 => b
a => 2 => b
a => 3 => b
*/

function createGraph(group: GroupedEthMarkets): Graph {
  const allTokens: Address[] = Object.keys(group.marketsByToken);
  const allMarkets: EthMarket[] = group.markets;
  const graph: Graph = {};

  for (const token of allTokens) {
    graph[`T${token}`] = { id: `T${token}`, address: token, connections: [] };
  }

  for (const market of allMarkets) {
    graph[`M${market.marketAddress}`] = {
      id: `M${market.marketAddress}`,
      address: market.marketAddress,
      market,
      connections: [],
    };
  }

  for (const market of allMarkets) {
    const M = graph[`M${market.marketAddress}`];
    const T0 = graph[`T${market.tokens[0]}`];
    const T1 = graph[`T${market.tokens[1]}`];
    M.connections.push(T0);
    M.connections.push(T1);
    T0.connections.push(M);
    T1.connections.push(M);
  }

  const nodes = Object.values(graph);
  for (const node of nodes) {
    node.connections = Array.from(new Set<GraphNode>(node.connections));
  }

  return graph;
}

export function createNangles<T extends EthMarket>(
  startTokens: Address[],
  Ns: number[],
  group: GroupedEthMarkets,
): Nangle<T>[] {
  const nangles: Nangle[] = [];

  for (const startToken of startTokens) {
    for (const N of Ns) {
      if (!isInteger(N) || N < 2 || N > 4) {
        throw new Error('Wrong N provided');
      }

      if (N == 2) {
        createDuoangles(startToken, group).forEach((n) => nangles.push(n));
      } else if (N === 3) {
        createTriangles(startToken, group).forEach((n) => nangles.push(n));
      } else if (N === 4) {
        createQuadangles(startToken, group).forEach((n) => nangles.push(n));
      }
    }
  }

  return nangles as Nangle<T>[];
}

export function createNanglesUsingGraph<T extends EthMarket>(
  startTokens: Address[],
  Ns: number[],
  group: GroupedEthMarkets,
): Nangle<T>[] {
  const graph = createGraph(group);
  const nangles: Nangle[] = [];

  for (const startToken of startTokens) {
    for (const N of Ns) {
      const startNode = graph[`T${startToken}`];
      const maxSize = N * 2;

      if (!isInteger(maxSize) || maxSize < 4) {
        throw new Error('Wrong N provided');
      }

      createNanglesRecursiveOpti(
        graph,
        startNode,
        startNode,
        startNode,
        startNode,
        maxSize,
        [startNode],
        nangles as Nangle[],
      );
    }
  }

  return nangles as Nangle<T>[];
}

function createNanglesRecursiveOpti(
  graph: Graph,
  currentToken: GraphNode,
  startToken: GraphNode,
  finishToken: GraphNode,
  excludeToken: GraphNode,
  pathSize: number,
  path: GraphNode[] = [startToken],
  result: Nangle[] = [],
): void {
  if (path.length !== pathSize - 1 || currentToken !== finishToken) {
    for (const childNode of currentToken.connections) {
      if (
        path.includes(childNode) ||
        (path.length > 1 &&
          path.length < pathSize - 1 &&
          childNode.connections.includes(excludeToken)) ||
        (path.length === pathSize - 1 && !childNode.connections.includes(finishToken))
      ) {
        continue;
      }

      path.push(childNode);
      let nextNode = childNode;
      let deleteMore = false;

      if (path.length < pathSize - 1) {
        const token =
          childNode.market!.tokens[0] === currentToken.address
            ? childNode.market!.tokens[1]
            : childNode.market!.tokens[0];

        if (path.length > 1 && token !== excludeToken.address) {
          nextNode = graph[`T${token}`];
          path.push(nextNode);
          deleteMore = true;
        }
      } else {
        result.push(pathToNangle(startToken.address, [...path]));
        path.pop();
        continue;
      }

      createNanglesRecursiveOpti(
        graph,
        nextNode,
        startToken,
        finishToken,
        excludeToken,
        pathSize,
        path,
        result,
      );
      path.pop();

      if (deleteMore) {
        path.pop();
      }
    }
  }
}

function createNanglesRecursive(
  currentNode: GraphNode,
  startNode: GraphNode,
  finishNode: GraphNode,
  pathSize: number,
  path: GraphNode[] = [startNode],
): Nangle[] {
  if (path.length === pathSize) {
    return [pathToNangle(startNode.id, path)];
  }

  const parent = path?.[path.length - 2];
  const result: Nangle[] = [];

  if (currentNode.market) {
    for (const childNode of currentNode.connections) {
      if (childNode === parent) {
        continue;
      }

      createNanglesRecursive(childNode, startNode, finishNode, pathSize, [
        ...path,
        childNode,
      ]).forEach((r) => result.push(r));
    }
  } else if (!currentNode.market && (path.length !== pathSize - 1 || currentNode !== finishNode)) {
    for (const childNode of currentNode.connections) {
      if (path.includes(childNode)) {
        continue;
      }

      if (path.length === pathSize - 1 && !childNode.connections.includes(finishNode)) {
        continue;
      }

      createNanglesRecursive(childNode, startNode, finishNode, pathSize, [
        ...path,
        childNode,
      ]).forEach((r) => result.push(r));
    }
  }

  return result;
}

function pathToNangle(startToken: Address, path: GraphNode[]): Nangle {
  let prevToken = startToken;
  const markets: EthMarket[] = [];
  const actions: MarketAction[] = [];

  for (const node of path) {
    if (!node.market) {
      continue;
    }

    const market = node.market;

    markets.push(market);
    actions.push(market.tokens[0] === prevToken ? 'sell' : 'buy');
    prevToken = market.tokens[0] === prevToken ? market.tokens[1] : market.tokens[0];
  }

  return {
    markets,
    actions,
    startToken,
  };
}

export function groupNanglesByMarkets(nangles: Nangle[]): Record<Address, Nangle[]> {
  return nangles.reduce((acc, nangle) => {
    for (const market of nangle.markets) {
      (acc[market.marketAddress] ?? (acc[market.marketAddress] = [])).push(nangle);
    }
    return acc;
  }, {} as Record<Address, Nangle[]>);
}

export function filterNanglesByMarkets(
  nanglesByMarket: Record<Address, Nangle[]>,
  byMarkets: EthMarket[],
): Nangle[] {
  const changedNangles: Set<Nangle> = new Set<Nangle>();

  for (const market of byMarkets) {
    const nangles = nanglesByMarket[market.marketAddress] ?? [];

    for (const nangle of nangles) {
      changedNangles.add(nangle);
    }
  }

  return Array.from(changedNangles);
}

export function createNanglesInefficient(
  currentNode: GraphNode,
  startNode: GraphNode,
  finishNode: GraphNode,
  pathSize: number,
): Nangle[] {
  let head = 0;
  const queue: GraphNode[] = [startNode];
  //const parents: (GraphNode | null)[] = [null];
  const paths: GraphNode[][] = [[startNode]];

  while (head < queue.length && paths[head].length < pathSize) {
    const currentNode = queue[head];
    const currentSize = paths[head].length;
    const currentParent = paths[head][paths[head].length - 2];
    const currentPath = paths[head];

    if (currentNode.market) {
      for (const childNode of currentNode.connections) {
        if (childNode === currentParent) {
          continue;
        }

        queue.push(childNode);
        paths.push([...currentPath, childNode]);
      }
    } else if (
      !currentNode.market &&
      (currentSize !== pathSize - 1 || currentNode !== finishNode)
    ) {
      for (const childNode of currentNode.connections) {
        if (currentPath.includes(childNode)) {
          continue;
        }

        if (currentSize === pathSize - 1 && !childNode.connections.includes(finishNode)) {
          continue;
        }

        queue.push(childNode);
        paths.push([...currentPath, childNode]);
      }
    }

    head++;
  }

  /*function str(s: string | undefined) {
    if (!s) {
      return '  ';
    }

    return s.length == 1 ? ` ${s}` : s;
  }*/

  //console.log(queue.map(i => str(i?.id)).join(', '));
  //console.log(parents.map(i => str(i?.id)).join(', '));
  //console.log(sizes.map(i => str(String(i))).join(', '));

  /*console.log('-------');
  const finalPaths = paths.filter(path => path.path.length === maxSize);

  finalPaths
    .map(path => (path.path.map(i => str(i.id)).join(', ')))
    .forEach(p => console.log(p));
  console.log(finalPaths.length);*/

  return paths.map((path) => pathToNangle(startNode.id, path));
}

/**
 m1, m2, m3, m4 = markets
 group1 = group of markets with firstToken
 group2 = group of markets without firstToken

 Schema:
 tokenA => m1 => tokenB => m2 => tokenC => m3 => tokenA

 m1 e group1 (with tokenA)
 m2 e group2 (without tokenA)
 m3 e group3 (without tokenA, without tokenB)
 m4 e group4 (with tokenA)
 */
export function createTriangles(startToken: Address, group: GroupedEthMarkets): Nangle[] {
  const nangles: Nangle[] = [];
  const tokenA = startToken;

  if (!group.marketsByToken[tokenA]) {
    return [];
  }

  const group1 = groupEthMarkets(group.marketsByToken[tokenA]);
  const group2 = groupEthMarkets(
    group.markets.filter((market) => market.tokens[0] !== tokenA && market.tokens[1] !== tokenA),
  );

  for (const market1 of group1.markets) {
    const tokenB = market1.tokens[0] !== tokenA ? market1.tokens[0] : market1.tokens[1];

    if (!group2.marketsByToken[tokenB]) {
      continue;
    }

    for (const market2 of group2.marketsByToken[tokenB]) {
      const tokenC = market2.tokens[0] !== tokenB ? market2.tokens[0] : market2.tokens[1];

      if (!group1.marketsByToken[tokenC]) {
        continue;
      }

      for (const market3 of group1.marketsByToken[tokenC]) {
        if (market3 === market1) {
          continue;
        }

        nangles.push({
          startToken: tokenA,
          markets: [market1, market2, market3],
          actions: [
            market1.tokens[0] === tokenA ? 'sell' : 'buy',
            market2.tokens[0] === tokenB ? 'sell' : 'buy',
            market3.tokens[0] === tokenC ? 'sell' : 'buy',
          ],
        });
      }
    }
  }

  return nangles;
}

export function createDuoangles(startToken: Address, group: GroupedEthMarkets): Nangle[] {
  const nangles: Nangle[] = [];
  const tokenA = startToken;

  if (!group.marketsByToken[tokenA]) {
    return [];
  }

  const group1 = groupEthMarkets(group.marketsByToken[tokenA]);

  for (const market1 of group1.markets) {
    const tokenB = market1.tokens[0] !== tokenA ? market1.tokens[0] : market1.tokens[1];

    for (const market2 of group1.marketsByToken[tokenB]) {
      if (market2 === market1) {
        continue;
      }

      nangles.push({
        startToken: tokenA,
        markets: [market1, market2],
        actions: [
          market1.tokens[0] === tokenA ? 'sell' : 'buy',
          market2.tokens[0] === tokenB ? 'sell' : 'buy',
        ],
      });
    }
  }

  return nangles;
}

/**
 Schema:
 tokenA => m1 => tokenB => m2 => tokenC => m3 => tokenD => m4 => tokenA
 tokenC !== tokenA
 tokenD !== tokenA

 m1 e group1 (with tokenA)
 m2 e group2 (with tokenB, without tokenA)
 m3 e group3 (with tokenC, without tokenA)
 m4 e group4 (with tokenA)
 */
export function createQuadangles(startToken: Address, group: GroupedEthMarkets): Nangle[] {
  const nangles: Nangle[] = [];
  const tokenA = startToken;

  if (!group.marketsByToken[tokenA]) {
    return [];
  }

  const group1 = groupEthMarkets(group.marketsByToken[tokenA]);
  const group2 = groupEthMarkets(
    group.markets.filter((market) => market.tokens[0] !== tokenA && market.tokens[1] !== tokenA),
  );
  for (const market1 of group1.markets) {
    const tokenB = market1.tokens[0] !== tokenA ? market1.tokens[0] : market1.tokens[1];

    if (!group2.marketsByToken[tokenB]) {
      continue;
    }

    for (const market2 of group2.marketsByToken[tokenB]) {
      const tokenC = market2.tokens[0] !== tokenB ? market2.tokens[0] : market2.tokens[1];

      if (!group.marketsByToken[tokenC]) {
        continue;
      }

      for (const market3 of group2.marketsByToken[tokenC]) {
        const tokenD = market3.tokens[0] !== tokenC ? market3.tokens[0] : market3.tokens[1];

        if (!group1.marketsByToken[tokenD] || market2 === market3 || market1 === market3) {
          continue;
        }

        for (const market4 of group1.marketsByToken[tokenD]) {
          if (market1 === market4 || market2 === market4 || market3 === market4) {
            continue;
          }

          nangles.push({
            startToken: tokenA,
            markets: [market1, market2, market3, market4],
            actions: [
              market1.tokens[0] === tokenA ? 'sell' : 'buy',
              market2.tokens[0] === tokenB ? 'sell' : 'buy',
              market3.tokens[0] === tokenC ? 'sell' : 'buy',
              market4.tokens[0] === tokenD ? 'sell' : 'buy',
            ],
          });
        }
      }
    }
  }

  return nangles;
}
