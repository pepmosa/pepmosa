// Atomic Kit Completion reservation helper.
// This calls the Supabase RPC so two customers cannot reserve the same remaining vial.
async function reserveKitCompletion({gbNumber,variantId,quantity,customerId}){
  if(!Number.isInteger(quantity)||quantity<1) throw new Error("Quantity must be at least 1.");
  const {data,error}=await sb.rpc("reserve_kit_units",{
    p_gb_number:gbNumber,
    p_variant_id:variantId,
    p_quantity:quantity,
    p_customer_id:customerId
  });
  if(error) throw error;
  return data;
}
