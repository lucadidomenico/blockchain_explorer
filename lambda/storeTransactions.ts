import {
	DynamoDBClient,
	BatchWriteItemCommand,
} from "@aws-sdk/client-dynamodb";
import { marshall } from "@aws-sdk/util-dynamodb";
import { Web3, TransactionInfo } from "web3";
import { SQSEvent } from "aws-lambda";

const dbclient = new DynamoDBClient();

const web3 = new Web3(
	"https://eth-mainnet.g.alchemy.com/v2/WJDRSl5RJf4zo9bQh9bDGJeiYDk9AoiU"
);

const saveTxs = async (transactions: TransactionInfo[]) => {
	const chunkSize = 25;
	const transactionChunks = [];
	for (let i = 0; i < transactions.length; i += chunkSize) {
		transactionChunks.push(transactions.slice(i, i + chunkSize));
	}

	const tableName = process.env.TABLE_NAME as string;
	if (!tableName) {
		throw new Error("TABLE environment variable is not set");
	}

	const promises = transactionChunks.map(async (txs, index) => {
		const params = {
			RequestItems: {
				[tableName]: txs.map((item) => ({
					PutRequest: {
						Item: marshall(item),
					},
				})),
			},
		};

		try {
			const command = new BatchWriteItemCommand(params);
			let response = await dbclient.send(command);
			console.log(`Batch ${index + 1} insert success`, response);

			let retryCount = 0;
			while (
				response.UnprocessedItems &&
				Object.keys(response.UnprocessedItems).length > 0 &&
				retryCount < 3
			) {
				console.log(`Retrying unprocessed items for batch ${index + 1}`);
				command.input.RequestItems = response.UnprocessedItems;
				response = await dbclient.send(command);
				retryCount++;
			}
			if (retryCount === 3) {
				console.log(`Max retry attempts reached for batch ${index + 1}`);
			}
		} catch (error) {
			console.error(`Batch ${index + 1} insert error`, error);
		}
	});

	await Promise.all(promises.map((p) => p.catch((e) => console.error(e))));
};

const getLatestBlockInfo = async () => {};

export const handler = async (event: SQSEvent): Promise<any> => {
	try {
		const promises = event.Records.map(async (record) => {
			console.log("ENTERED MOD");
			const transactions = JSON.parse(record.body);
			await saveTxs(transactions);
		});
		await Promise.all(promises);
	} catch (err) {
		if (err instanceof Error) {
			console.log("Error calling getBlockInfo " + err.stack);
		}
	}
};
