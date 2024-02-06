import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import axios, { AxiosResponse } from "axios";
import {
	DynamoDBClient,
	GetItemCommand,
	UpdateItemCommand,
} from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";

const url =
	"https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd";

const client = new DynamoDBClient({});
const tableName = "Prices";
const REFRESH_TIME = 600000; // 10 minutes

type Price = {
	usdPrice: number;
	lastUpdated: number;
};

const getPriceFromDynamoDB = async (): Promise<Price | undefined> => {
	const { Item } = await client.send(
		new GetItemCommand({
			TableName: tableName,
			Key: marshall({
				currency: "ethereum",
			}),
		})
	);
	return Item
		? {
				usdPrice: unmarshall(Item).usdPrice,
				lastUpdated: unmarshall(Item).lastUpdated,
		  }
		: undefined;
};

const updatePriceOnDynamoDB = async (newPrice: number) => {
	await client.send(
		new UpdateItemCommand({
			TableName: tableName,
			Key: marshall({
				currency: "ethereum",
			}),
			UpdateExpression: "SET usdPrice = :newPrice, lastUpdated = :now",
			ExpressionAttributeValues: marshall({
				":newPrice": newPrice,
				":now": Date.now(),
			}),
		})
	);
};

type ResponsePrice = {
	ethereum: { usd: number };
};

export const handler = async (
	event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
	try {
		let price = await getPriceFromDynamoDB();
		if (!price || price.lastUpdated < Date.now() - REFRESH_TIME) {
			const res: AxiosResponse = await axios.get(url);
			const tmp = res.data as ResponsePrice;
			await updatePriceOnDynamoDB(tmp.ethereum.usd);
			price = { usdPrice: tmp.ethereum.usd, lastUpdated: Date.now() };
		}
		return {
			statusCode: 200,
			body: JSON.stringify({
				message: price,
			}),
		};
	} catch (err) {
		console.log(err);
		return {
			statusCode: 500,
			body: JSON.stringify({
				message: "error: " + JSON.stringify(err),
			}),
		};
	}
};
