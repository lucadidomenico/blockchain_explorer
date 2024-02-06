import { Block, BlockHeaderOutput, Numbers, TransactionInfo, Web3 } from "web3";
import { SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import dotenv from "dotenv";
dotenv.config();

// if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_KEY) {
// 	throw new Error("AWS credentials are not set");
// }

if (!process.env.ALCHEMY_NODE) {
	throw new Error("Alchemy credentials are not set");
}

const web3 = new Web3(process.env.ALCHEMY_NODE);
const sqsClient = new SQSClient({
	region: "us-east-1",
});

const SQS_QUEUE_URL = process.env.SQS_QUEUE_URL;

const sendMsg = async (transactions: TransactionInfo[]) => {
	// TODO the queue must be a FIFO
	const command = new SendMessageCommand({
		QueueUrl: SQS_QUEUE_URL,
		DelaySeconds: 0,
		MessageGroupId: "BlockInfo",
		MessageBody: JSON.stringify(
			transactions,
			(key, value) => (typeof value === "bigint" ? value.toString() : value) // return everything else unchanged
		),
	});
	const response = await sqsClient.send(command);
	console.log(response);
};

const handleEvent = async (header: BlockHeaderOutput) => {
	try {
		if (!header.number) {
			console.log("Invalid block. No header.number in block header");
			return;
		}
		const blockInfo: Block = await web3.eth.getBlock(header.number, true);
		const transactions: TransactionInfo[] =
			blockInfo.transactions as TransactionInfo[];

		await sendMsg(transactions);
	} catch (e) {
		console.log(e);
	}
};

const main = async () => {
	console.log("LISTENER IS RUNNING");
	const subscription = await web3.eth.subscribe("newHeads"); // 'newBlockHeaders' would work as well
	subscription.on("data", (header) => {
		handleEvent(header);
	});
};

main()
	.then()
	.catch((e) => console.log(e));
