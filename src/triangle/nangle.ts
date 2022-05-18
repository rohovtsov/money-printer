import { Address, EthMarket, GroupedEthMarkets, groupEthMarkets, MarketAction } from '../entities';
import { UniswapV2Market } from '../uniswap/uniswap-v2-market';
import { isInteger } from 'lodash';

export interface Nangle<T extends EthMarket = EthMarket> {
  markets: T[];
  actions: MarketAction[];
  startToken: Address;
}

interface GraphNode {
  id: Address;
  market?: EthMarket;
  connections: Set<GraphNode>;
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
    graph[token] = { id: token, connections: new Set<GraphNode>() };
  }

  for (const market of allMarkets) {
    graph[market.marketAddress] = {
      id: market.marketAddress,
      market,
      connections: new Set<GraphNode>(),
    };
  }

  for (const market of allMarkets) {
    const M = graph[market.marketAddress];
    const T0 = graph[market.tokens[0]];
    const T1 = graph[market.tokens[1]];
    M.connections.add(T0);
    M.connections.add(T1);
    T0.connections.add(M);
    T1.connections.add(M);
  }

  return graph;
}

export function createNangles<T extends EthMarket>(
  startTokens: Address[],
  Ns: number[],
  group: GroupedEthMarkets,
): Nangle<T>[] {
  const graph = createGraph(group);
  const nangles: Nangle[] = [];

  for (const startToken of startTokens) {
    for (const N of Ns) {
      const startNode = graph[startToken];
      const finishNode = graph[startToken];
      const maxSize = N * 2;

      if (!isInteger(maxSize) || maxSize < 4) {
        throw new Error('Wrong N provided');
      }

      if (maxSize === 6) {
        nangles.push(...createTriangles([startToken], group));
      } else {
        nangles.push(...createNanglesRecursive(startNode, startNode, finishNode, maxSize));
      }
    }
  }

  return nangles as Nangle<T>[];
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

      const moreResults = createNanglesRecursive(childNode, startNode, finishNode, pathSize, [
        ...path,
        childNode,
      ]);
      result.push(...moreResults);
    }
  } else if (!currentNode.market && (path.length !== pathSize - 1 || currentNode !== finishNode)) {
    for (const childNode of currentNode.connections) {
      if (path.includes(childNode)) {
        continue;
      }

      if (path.length === pathSize - 1 && !childNode.connections.has(finishNode)) {
        continue;
      }

      const moreResults = createNanglesRecursive(childNode, startNode, finishNode, pathSize, [
        ...path,
        childNode,
      ]);
      result.push(...moreResults);
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
  const changedTriangles: Set<Nangle> = new Set<Nangle>();

  for (const market of byMarkets) {
    const triangles = nanglesByMarket[market.marketAddress] ?? [];

    for (const triangle of triangles) {
      changedTriangles.add(triangle);
    }
  }

  return Array.from(changedTriangles);
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

        if (currentSize === pathSize - 1 && !childNode.connections.has(finishNode)) {
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

 Triangle Schema:
 tokenA => m1 => tokenB => m2 => tokenC => m3 => tokenA

 m1 e group1 (with tokenA)
 m2 e group2 (without tokenA)
 m3 e group3 (without tokenA, without tokenB)
 m4 e group4 (with tokenA)
 */
export function createTriangles(startingTokens: Address[], group: GroupedEthMarkets): Nangle[] {
  const nangles: Nangle[] = [];

  for (const tokenA of startingTokens) {
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
            markets: [market1, market2, market3] as UniswapV2Market[],
            actions: [
              market1.tokens[0] === tokenA ? 'sell' : 'buy',
              market2.tokens[0] === tokenB ? 'sell' : 'buy',
              market3.tokens[0] === tokenC ? 'sell' : 'buy',
            ],
          });
        }
      }
    }
  }

  return nangles;
}

//A > M1 > B > M3 > C > M2 > A
//A > M0 > B > M3 > C > M2 > A
//A > M2
