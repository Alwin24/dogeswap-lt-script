import {
	TransactionInstruction,
	VersionedTransaction,
	TransactionMessage,
	PublicKey,
	AddressLookupTableProgram,
	Connection,
	clusterApiUrl,
	Keypair,
	AddressLookupTableAccount,
} from '@solana/web3.js'
import { readFileSync } from 'fs'
import { homedir } from 'os'

const connection = new Connection(clusterApiUrl('mainnet-beta'), 'processed')
const slot = await connection.getSlot('recent')

export function createKeypairFromFile(path: string) {
	return Keypair.fromSecretKey(Buffer.from(JSON.parse(readFileSync(path, 'utf-8'))))
}

export async function sendTransactionV0(
	connection: Connection,
	instructions: Array<TransactionInstruction>,
	payer: Keypair
) {
	let blockhash = (await connection.getLatestBlockhash('processed')).blockhash

	const messageV0 = new TransactionMessage({
		payerKey: payer.publicKey,
		recentBlockhash: blockhash,
		instructions,
	}).compileToV0Message()

	const tx = new VersionedTransaction(messageV0)
	tx.sign([payer])
	const sx = await connection.sendTransaction(tx)

	console.log(`Signature: https://explorer.solana.com/tx/${sx}`)
}

const payer = createKeypairFromFile(homedir() + '/second-wallet/second-keypair.json')

console.log('Payer publicKey :', payer.publicKey.toBase58())

const [lookupTableInst, lookupTableAddress] = AddressLookupTableProgram.createLookupTable({
	authority: payer.publicKey,
	payer: payer.publicKey,
	recentSlot: slot,
})

console.log('lookup table address:', lookupTableAddress.toBase58())

// transaction-1 Jupiter token to sol (performed with dev wallet)
// transaction-2 Elixir nft buy
// transaction-3 Elixir nft sell

let txns = (
	await connection.getTransactions(
		[
			'3hGG4ZRCGt6mnQJQ4Ggp2VwLiuP9ixPad5YP8F9QdcG8YTp7ay3wvN9To1vTzi5oGx6mf2sqJT8mQinzy9Uhb1ZV',
			'4B6DemanpdnR1CgMdTyoicCHT751FoSzAYPgSaSL5iuNnG5RtACQgZ6FybKWpPM8SvHBjAr714fR3kcSw89c6K4N',
			'4hYvajAhSJ6k9zmzMRuihrrLPuFsdKE9Am2E8VAW8dgc7PP97PiqU4Fk6ABBfsWu47T2iMwpKXsDjix9uEjpvaS8',
		],
		{ commitment: 'confirmed', maxSupportedTransactionVersion: 1 }
	)
).map((i) => i?.transaction)

let addressesString: Array<string> = []
for (let i = 0; i < txns.length; ++i) {
	const addressLookupTableAccounts = await Promise.all(
		txns[i]!.message.addressTableLookups.map(async (lookup) => {
			return new AddressLookupTableAccount({
				key: lookup.accountKey,
				state: AddressLookupTableAccount.deserialize(
					await connection.getAccountInfo(lookup.accountKey).then((res) => res!.data)
				),
			})
		})
	)

	const instructions = TransactionMessage.decompile(txns[i]!.message, {
		addressLookupTableAccounts,
	}).instructions

	addressesString.push(...instructions.flatMap((i) => i.keys.flatMap((k) => k.pubkey.toBase58())))
}

// let existingLT = new PublicKey('J2Hch5H4U1UH9px6yYjfqG4an1bYNUjJDeFMtdzRwypH')
// let existingLT = new PublicKey('6FGojTmD2qxh8t4zQMQW9b9jEkRRAt8yCR1HXY6CDxDT')

//remove duplicates from addresses array
const addresses: Array<PublicKey> = [...new Set(addressesString)].map((acc) => new PublicKey(acc))

console.log('addresses count :', addresses.length)

const extendInstruction1 = AddressLookupTableProgram.extendLookupTable({
	payer: payer.publicKey,
	authority: payer.publicKey,
	lookupTable: lookupTableAddress,
	addresses: addresses.slice(0, 21),
})

const extendInstruction2 = AddressLookupTableProgram.extendLookupTable({
	payer: payer.publicKey,
	authority: payer.publicKey,
	lookupTable: lookupTableAddress,
	addresses: addresses.slice(21, 41),
})

const extendInstruction3 = AddressLookupTableProgram.extendLookupTable({
	payer: payer.publicKey,
	authority: payer.publicKey,
	lookupTable: lookupTableAddress,
	addresses: addresses.slice(41),
})

await sendTransactionV0(connection, [lookupTableInst, extendInstruction1], payer)

await new Promise((resolve) => setTimeout(resolve, 15000))
await sendTransactionV0(connection, [extendInstruction2], payer)

await new Promise((resolve) => setTimeout(resolve, 15000))
await sendTransactionV0(connection, [extendInstruction3], payer)
