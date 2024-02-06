import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as apigw from "aws-cdk-lib/aws-apigateway";
import { Duration } from "aws-cdk-lib";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as iam from "aws-cdk-lib/aws-iam";
import { SqsToLambda } from "@aws-solutions-constructs/aws-sqs-lambda";
import { DockerImageAsset } from "aws-cdk-lib/aws-ecr-assets";
import path from "path";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import dotenv from "dotenv";
dotenv.config();

export class CdkBlockchainExplorerStack extends cdk.Stack {
	constructor(scope: Construct, id: string, props?: cdk.StackProps) {
		super(scope, id, props);

		/*
		 * Setup DynamoDB tables
		 */

		// Prices table
		const pricesTable = new dynamodb.Table(this, "PricesTable", {
			tableName: "Prices",
			partitionKey: { name: "currency", type: dynamodb.AttributeType.STRING },
			removalPolicy: cdk.RemovalPolicy.DESTROY,
		});

		// Transactions table
		const transactionTable = new dynamodb.Table(this, "TransactionsTable", {
			partitionKey: { name: "hash", type: dynamodb.AttributeType.STRING },
			billingMode: dynamodb.BillingMode.PROVISIONED,
			tableName: "Transactions",
			removalPolicy: cdk.RemovalPolicy.DESTROY,
		});

		transactionTable.addGlobalSecondaryIndex({
			indexName: "FromIndex",
			partitionKey: { name: "from", type: dynamodb.AttributeType.STRING },
			projectionType: dynamodb.ProjectionType.ALL,
		});

		transactionTable.addGlobalSecondaryIndex({
			indexName: "ToIndex",
			partitionKey: { name: "to", type: dynamodb.AttributeType.STRING },
			projectionType: dynamodb.ProjectionType.ALL,
		});

		/*
		 * Setup lambda functions
		 */

		const getPriceLambdaHandler = new NodejsFunction(this, "GetPriceHandler", {
			runtime: lambda.Runtime.NODEJS_20_X,
			entry: "lambda/getPrice.ts",
			handler: "handler",
			bundling: {
				externalModules: ["aws-sdk"],
				nodeModules: ["axios"],
			},
		});

		const getTxsByAddrLambdaHandler = new NodejsFunction(
			this,
			"GetTxsHandler",
			{
				runtime: lambda.Runtime.NODEJS_20_X,
				entry: "lambda/getTransactionsByAddr.ts",
				handler: "handler",
				bundling: {
					externalModules: ["aws-sdk"],
					nodeModules: ["web3", "web3-validator"],
				},
			}
		);

		const getTxDetailsLambdaHandler = new NodejsFunction(
			this,
			"GetTxDetailsHandler",
			{
				runtime: lambda.Runtime.NODEJS_20_X,
				entry: "lambda/getTransactionDetails.ts",
				handler: "handler",
				bundling: {
					externalModules: ["aws-sdk"],
					nodeModules: ["web3"],
				},
			}
		);

		// Lambda permissions on DynamoDB
		pricesTable.grantReadWriteData(getPriceLambdaHandler);
		transactionTable.grantReadData(getTxsByAddrLambdaHandler);
		transactionTable.grantReadData(getTxDetailsLambdaHandler);

		/*
		 * Setup API endpoints
		 */
		// /getethprice
		const api = new apigw.LambdaRestApi(this, "Endpoint", {
			handler: getPriceLambdaHandler,
			proxy: false,
		});

		api.root.addResource("getethprice").addMethod("GET");

		// /gettxs
		const getTxsResource = api.root.addResource("gettxs");
		getTxsResource.addMethod(
			"GET",
			new apigw.LambdaIntegration(getTxsByAddrLambdaHandler)
		);

		// /gettx
		const getTxDetailsResource = api.root.addResource("gettx");
		getTxDetailsResource.addMethod(
			"GET",
			new apigw.LambdaIntegration(getTxDetailsLambdaHandler)
		);

		/*
		 * Setup Lambda + SQS to store Transactions
		 */

		const storeTxsLambdaHandler = new NodejsFunction(this, "StoreTxsHandler", {
			runtime: lambda.Runtime.NODEJS_20_X,
			entry: "lambda/storeTransactions.ts",
			handler: "handler",
			bundling: {
				externalModules: ["aws-sdk"],
				nodeModules: ["axios", "web3"],
			},
			environment: {
				TABLE_NAME: transactionTable.tableName,
			},
		});

		storeTxsLambdaHandler.addToRolePolicy(
			new iam.PolicyStatement({
				actions: ["dynamodb:BatchWriteItem"],
				resources: [transactionTable.tableArn],
			})
		);

		const sqsToLambda = new SqsToLambda(this, "SqsToLambdaPattern", {
			existingLambdaObj: storeTxsLambdaHandler,
			queueProps: {
				fifo: true,
				deliveryDelay: Duration.millis(0),
				queueName: "BlockInfoQueue.fifo",
				contentBasedDeduplication: true,
			},
			deadLetterQueueProps: {
				fifo: true,
				deliveryDelay: Duration.millis(0),
				queueName: "BlockInfoDeadLetterQueue.fifo",
			},
		});

		/*
		 * START SETTING UP EC2 ISTANCES
		 */

		const cluster = new ecs.Cluster(this, "BlockExplorerCluster");

		const taskRole = new iam.Role(this, "TaskRole", {
			assumedBy: new iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
		});

		// Attach necessary policies to your role
		taskRole.addManagedPolicy(
			iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonSQSFullAccess")
		);

		const taskDefinition = new ecs.FargateTaskDefinition(
			this,
			"BlockExplorerTaskDefinition",
			{
				taskRole: taskRole,
			}
		);

		const image = new DockerImageAsset(this, "BlockExplorerEventListener", {
			directory: path.join(
				__dirname,
				"../images/event-listener-background-service"
			),
			invalidation: {
				buildArgs: false,
			},
		});

		const container = taskDefinition.addContainer("BlockExplorerContainer", {
			image: ecs.ContainerImage.fromDockerImageAsset(image),
			logging: ecs.LogDrivers.awsLogs({
				streamPrefix: "blockexplorer-log-group",
				logRetention: 30,
			}),
		});

		container.addEnvironment(
			"ALCHEMY_NODE",
			process.env.ALCHEMY_NODE as string
		);
		container.addEnvironment("SQS_QUEUE_URL", sqsToLambda.sqsQueue.queueUrl);

		new ecs.FargateService(this, "BlockExplorerFargateService", {
			cluster,
			taskDefinition,
		});
	}
}
