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

// connect to a cluster and get the current `slot`
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

	console.log(`** -- Signature: https://explorer.solana.com/tx/${sx}`)
}

const payer = createKeypairFromFile(homedir() + '/second-wallet/second-keypair.json')

console.log('Payer publicKey :', payer.publicKey.toBase58())

const [lookupTableInst, lookupTableAddress] = AddressLookupTableProgram.createLookupTable({
	authority: payer.publicKey,
	payer: payer.publicKey,
	recentSlot: slot,
})

console.log('lookup table address:', lookupTableAddress.toBase58())

let txns = (
	await connection.getTransactions(
		[
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

let existingLT = new PublicKey('3ERo1t8sjp6zUfgnsyL24wfdef6vAd54Zs7PMx74xf8g')

//remove duplicates from addresses array
const addresses: Array<PublicKey> = [...new Set(addressesString)].map((acc) => new PublicKey(acc))

//remove addresses in existingAddresses from addresses array
// addresses = addresses.filter((address) => !existingAddresses!.includes(address))

console.log('addresses count :', addresses.length)

const extendInstruction1 = AddressLookupTableProgram.extendLookupTable({
	payer: payer.publicKey,
	authority: payer.publicKey,
	lookupTable: lookupTableAddress,
	addresses: addresses.slice(0, 25),
})

const extendInstruction2 = AddressLookupTableProgram.extendLookupTable({
	payer: payer.publicKey,
	authority: payer.publicKey,
	lookupTable: existingLT,
	addresses: addresses.slice(25),
})


await sendTransactionV0(connection, [lookupTableInst, extendInstruction1], payer)
//pause ececution for 10 seconds
await new Promise((resolve) => setTimeout(resolve, 30000))
await sendTransactionV0(connection, [extendInstruction2], payer)


// console.log('txnSignatures :', txnSignatures.map((i) => `https://explorer.solana.com/tx/${i}`))
