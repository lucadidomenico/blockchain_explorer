import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { DynamoDBClient, GetItemCommand } from "@aws-sdk/client-dynamodb";
import { TransactionInfo } from "web3";
import { unmarshall } from "@aws-sdk/util-dynamodb";

const client = new DynamoDBClient({});
const tableName = "Transactions";

const getTxByHash = async (
	hash: string
): Promise<TransactionInfo | undefined> => {
	const txsItem = await client.send(
		new GetItemCommand({
			TableName: tableName,
			Key: {
				hash: { S: hash },
			},
		})
	);

	if (txsItem.Item) return unmarshall(txsItem.Item) as TransactionInfo;
	else return undefined;
};

export const handler = async (
	event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
	try {
		const hash = event.queryStringParameters?.["hash"];

		if (hash) {
			const txs = await getTxByHash(hash);
			return {
				statusCode: 200,
				body: JSON.stringify(txs),
			};
		} else {
			return {
				statusCode: 500,
				body: JSON.stringify({ message: "missing hash" }),
			};
		}
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
