import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { DynamoDBClient, QueryCommand } from "@aws-sdk/client-dynamodb";
import { TransactionInfo } from "web3";
import { unmarshall } from "@aws-sdk/util-dynamodb";
import { isAddress } from "web3-validator";

const client = new DynamoDBClient({});
const tableName = "Transactions";

const getTxsFromAddress = async (addr: string) => {
	const txsFromAddrItems = await client.send(
		new QueryCommand({
			TableName: tableName,
			IndexName: "FromIndex",
			KeyConditionExpression: "#from = :addr",
			ExpressionAttributeNames: {
				"#from": "from",
			},
			ExpressionAttributeValues: {
				":addr": { S: addr },
			},
		})
	);

	return txsFromAddrItems;
};

const getTxsToAddress = async (addr: string) => {
	const txsToAddrItems = await client.send(
		new QueryCommand({
			TableName: tableName,
			IndexName: "ToIndex",
			KeyConditionExpression: "#to = :addr",
			ExpressionAttributeNames: {
				"#to": "to",
			},
			ExpressionAttributeValues: {
				":addr": { S: addr },
			},
		})
	);

	return txsToAddrItems;
};

const getTxsByAddress = async (addr: string): Promise<TransactionInfo[]> => {
	const txsFromAddrItems = await getTxsFromAddress(addr);
	const txsToAddrItems = await getTxsToAddress(addr);

	const txsFromAddr = txsFromAddrItems.Items?.map(
		(item) => unmarshall(item) as TransactionInfo
	);

	const txsToAddr = txsToAddrItems.Items?.map(
		(item) => unmarshall(item) as TransactionInfo
	);

	let res: TransactionInfo[] = [];
	if (txsToAddr) res = [...txsToAddr];
	if (txsFromAddr) res = [...res, ...txsFromAddr];
	return res;
};

export const handler = async (
	event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
	try {
		const address = event.queryStringParameters?.["address"];

		if (!address || !isAddress(address)) {
			return {
				statusCode: 500,
				body: JSON.stringify({ message: "invalid address" }),
			};
		}

		const txs = await getTxsByAddress(address);

		return {
			statusCode: 200,
			body: JSON.stringify(txs),
		};
	} catch (err) {
		console.log(err);
		return {
			statusCode: 500,
			body: JSON.stringify({
				message: "error calling API",
			}),
		};
	}
};
